import { createEffectActor, createEffectLogic, join, setupEffect } from '@xstate/effect'
import { Clock, Context, Effect, Schema } from 'effect'

import { SchedulerJobs } from './jobs-service.ts'
import { MINUTE_MS } from './schedule.ts'

export const jobKinds = ['auth', 'scan', 'identity', 'maintenance'] as const
export type JobKind = (typeof jobKinds)[number]
export type Waits = Record<JobKind, number>

export const dueJob = (waits: Waits): JobKind | null =>
  jobKinds.find((job) => waits[job] <= 0) ?? null

export const earliestWait = (waits: Waits): number =>
  Math.max(1, Math.min(...jobKinds.map((job) => waits[job])))

export const subtractWaits = (waits: Waits, elapsed: number): Waits => ({
  auth: Math.max(0, waits.auth - elapsed),
  scan: Math.max(0, waits.scan - elapsed),
  identity: Math.max(0, waits.identity - elapsed),
  maintenance: Math.max(0, waits.maintenance - elapsed),
})

const PolicyConfig = Schema.Struct({
  authRefreshMs: Schema.Finite,
  scanIntervalMs: Schema.Finite,
  identityActiveMs: Schema.Finite,
  identityIdleMs: Schema.Finite,
  maintenanceIntervalMs: Schema.Finite,
})

const WaitsSchema = Schema.Struct({
  auth: Schema.Finite,
  scan: Schema.Finite,
  identity: Schema.Finite,
  maintenance: Schema.Finite,
})

export const SchedulerInput = Schema.Struct({
  jobsEnabled: Schema.Boolean,
  recoverOnBoot: Schema.Boolean,
  maintenanceDelayMs: Schema.Finite,
  policy: PolicyConfig,
})

export type SchedulerInput = typeof SchedulerInput.Type

export const SchedulerContext = Schema.Struct({
  jobsEnabled: Schema.Boolean,
  recoverOnBoot: Schema.Boolean,
  policy: PolicyConfig,
  waits: WaitsSchema,
  exitCode: Schema.Finite,
})

const IdentityOutcome = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('skipped') }),
  Schema.Struct({ kind: Schema.Literal('failed') }),
  Schema.Struct({
    kind: Schema.Literal('ran'),
    tried: Schema.Finite,
    budgetRemaining: Schema.Finite,
  }),
])

const IdentityResult = Schema.Struct({
  outcome: IdentityOutcome,
  budgetResetsInMs: Schema.Finite,
})

const identityWait = (
  policy: typeof PolicyConfig.Type,
  result: typeof IdentityResult.Type,
): number => {
  if (result.outcome.kind === 'skipped') return MINUTE_MS
  if (result.outcome.kind === 'failed') return policy.identityIdleMs
  if (result.outcome.budgetRemaining <= 0) return result.budgetResetsInMs
  return result.outcome.tried > 0 ? policy.identityActiveMs : policy.identityIdleMs
}

const bootstrap = createEffectLogic({
  schemas: {
    input: Schema.Struct({ recover: Schema.Boolean, scanIntervalMs: Schema.Finite }),
    output: Schema.Struct({ scanWaitMs: Schema.Finite }),
  },
  effect: ({ input }) =>
    Effect.gen(function* () {
      const jobs = yield* SchedulerJobs
      yield* jobs.migrate
      if (input.recover) yield* jobs.recover

      const { latestSuccessfulAt } = yield* jobs.status
      const now = yield* Clock.currentTimeMillis
      const scanWaitMs =
        latestSuccessfulAt === null
          ? 0
          : Math.max(0, latestSuccessfulAt + input.scanIntervalMs - now)

      yield* Effect.logInfo(`next scan in ${Math.ceil(scanWaitMs / MINUTE_MS)} minutes`)
      return { scanWaitMs }
    }),
})

const auth = createEffectLogic({
  effect: () => SchedulerJobs.use((jobs) => jobs.auth),
})

const scan = createEffectLogic({
  effect: () => SchedulerJobs.use((jobs) => jobs.scan),
})

const identity = createEffectLogic({
  schemas: { output: IdentityResult },
  effect: () => SchedulerJobs.use((jobs) => jobs.identity),
})

const maintenance = createEffectLogic({
  effect: () => SchedulerJobs.use((jobs) => jobs.maintenance),
})

const ApiExited = Schema.Struct({ code: Schema.NullOr(Schema.Finite) })

export class ApiProcess extends Context.Service<
  ApiProcess,
  { readonly supervise: Effect.Effect<typeof ApiExited.Type, never> }
>()('ApiProcess') {}

const api = createEffectLogic({
  schemas: { output: ApiExited },
  effect: () =>
    Effect.gen(function* () {
      const process = yield* ApiProcess
      return yield* process.supervise
    }),
})

export const schedulerMachine = setupEffect({
  schemas: {
    input: SchedulerInput,
    context: SchedulerContext,
    events: { STOP: Schema.Struct({ signal: Schema.String }) },
  },
  actors: { bootstrap, auth, scan, identity, maintenance, api },
  delays: {
    laneWait: ({ context }) => earliestWait(context.waits),
  },
}).createMachine({
  id: 'scheduler',
  context: ({ input }) => ({
    jobsEnabled: input.jobsEnabled,
    recoverOnBoot: input.recoverOnBoot,
    policy: input.policy,
    waits: {
      auth: 0,
      scan: 0,
      identity: 0,
      maintenance: input.maintenanceDelayMs,
    },
    exitCode: 0,
  }),
  initial: 'booting',
  on: {
    STOP: { target: '.stopping', context: { exitCode: 0 } },
  },
  states: {
    booting: {
      invoke: {
        src: 'bootstrap',
        input: ({ context }) => ({
          recover: context.recoverOnBoot,
          scanIntervalMs: context.policy.scanIntervalMs,
        }),
        onDone: ({ context, event }) => ({
          target: 'running',
          context: { waits: { ...context.waits, scan: event.output.scanWaitMs } },
        }),
        onError: { target: 'failed', context: { exitCode: 1 } },
      },
    },
    running: {
      type: 'parallel',
      states: {
        api: {
          initial: 'supervising',
          states: {
            supervising: {
              invoke: {
                src: 'api',
                onDone: { target: '#scheduler.stopping', context: { exitCode: 1 } },
              },
            },
          },
        },
        jobs: {
          initial: 'waiting',
          states: {
            waiting: {
              always: ({ context }) => {
                if (!context.jobsEnabled) return { target: 'disabled' }
                const job = dueJob(context.waits)
                return job === null ? undefined : { target: job }
              },
              after: {
                laneWait: ({ context }) => ({
                  target: 'waiting',
                  reenter: true,
                  context: {
                    waits: subtractWaits(context.waits, earliestWait(context.waits)),
                  },
                }),
              },
            },
            disabled: {},
            auth: {
              invoke: {
                src: 'auth',
                onDone: ({ context }) => ({
                  target: 'waiting',
                  context: { waits: { ...context.waits, auth: context.policy.authRefreshMs } },
                }),
                onError: ({ context }) => ({
                  target: 'waiting',
                  context: { waits: { ...context.waits, auth: context.policy.authRefreshMs } },
                }),
              },
            },
            scan: {
              invoke: {
                src: 'scan',
                onDone: ({ context }) => ({
                  target: 'waiting',
                  context: { waits: { ...context.waits, scan: context.policy.scanIntervalMs } },
                }),
                onError: ({ context }) => ({
                  target: 'waiting',
                  context: { waits: { ...context.waits, scan: context.policy.scanIntervalMs } },
                }),
              },
            },
            identity: {
              invoke: {
                src: 'identity',
                onDone: ({ context, event }) => ({
                  target: 'waiting',
                  context: {
                    waits: {
                      ...context.waits,
                      identity: identityWait(context.policy, event.output),
                    },
                  },
                }),
                onError: ({ context }) => ({
                  target: 'waiting',
                  context: { waits: { ...context.waits, identity: context.policy.identityIdleMs } },
                }),
              },
            },
            maintenance: {
              invoke: {
                src: 'maintenance',
                onDone: ({ context }) => ({
                  target: 'waiting',
                  context: {
                    waits: { ...context.waits, maintenance: context.policy.maintenanceIntervalMs },
                  },
                }),
                onError: ({ context }) => ({
                  target: 'waiting',
                  context: {
                    waits: { ...context.waits, maintenance: context.policy.maintenanceIntervalMs },
                  },
                }),
              },
            },
          },
        },
      },
    },
    stopping: {
      type: 'final',
      output: ({ context }) => ({ exitCode: context.exitCode }),
    },
    failed: {
      type: 'final',
      output: { exitCode: 1 },
    },
  },
})

export type SchedulerMachine = typeof schedulerMachine

export const runScheduler = (options: {
  readonly input: SchedulerInput
  readonly signal?: AbortSignal
}) =>
  Effect.gen(function* () {
    const actor = yield* createEffectActor(schedulerMachine, { input: options.input })

    const onSignal = () => actor.send({ type: 'STOP', signal: 'signal' })
    options.signal?.addEventListener('abort', onSignal, { once: true })
    if (options.signal?.aborted) onSignal()

    const output = yield* join(actor)
    options.signal?.removeEventListener('abort', onSignal)
    return output
  })
