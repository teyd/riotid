import { createEffectActor, join, waitFor, type EffectActor } from '@xstate/effect'
import { Clock, Effect, Layer, Queue, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vite-plus/test'

import { JobError } from './jobs.ts'
import { SchedulerJobs, type IdentityResult, type SchedulerJobsShape } from './jobs-service.ts'
import { ApiProcess, SchedulerInput, schedulerMachine } from './machine.ts'
import { HOUR_MS, MINUTE_MS } from './schedule.ts'

type JobCall = { readonly job: string; readonly at: number }

const minutes = (value: number) => value * MINUTE_MS

const policy = {
  authRefreshMs: minutes(45),
  scanIntervalMs: 6 * HOUR_MS,
  identityActiveMs: minutes(15),
  identityIdleMs: minutes(30),
  maintenanceIntervalMs: 24 * HOUR_MS,
}

const input = (overrides: Partial<SchedulerInput> = {}) => ({
  jobsEnabled: true,
  recoverOnBoot: false,
  maintenanceDelayMs: minutes(10),
  policy,
  ...overrides,
})

const makeHarness = (options: {
  readonly jobs?: (record: (job: string) => Effect.Effect<void>) => Partial<SchedulerJobsShape>
  readonly supervise?: Effect.Effect<{ readonly code: number | null }, never>
}) => {
  const calls = Effect.runSync(Queue.unbounded<JobCall>())
  const interrupted = Ref.makeUnsafe<ReadonlyArray<string>>([])

  const record = (job: string) =>
    Effect.gen(function* () {
      const at = yield* Clock.currentTimeMillis
      yield* Queue.offer(calls, { job, at })
    })

  const service: SchedulerJobsShape = {
    migrate: record('migrate'),
    recover: record('recover'),
    status: record('status').pipe(Effect.as({ latestSuccessfulAt: null })),
    scan: record('scan').pipe(Effect.as({ players: 1 })),
    identity: record('identity').pipe(
      Effect.as<IdentityResult>({
        outcome: { kind: 'ran', tried: 1, budgetRemaining: 100 },
        budgetResetsInMs: minutes(60),
      }),
    ),
    maintenance: record('maintenance'),
    auth: record('auth'),
    ...options.jobs?.(record),
  }

  const layer = Layer.mergeAll(
    Layer.succeed(SchedulerJobs, service),
    Layer.succeed(ApiProcess, { supervise: options.supervise ?? Effect.never }),
    TestClock.layer(),
  )

  return { calls, interrupted, layer }
}

const expectCall = (calls: Queue.Queue<JobCall>, job: string, at: number) =>
  Effect.gen(function* () {
    const call = yield* Queue.take(calls)
    expect(call).toEqual({ job, at })
  })

const waitForJobs = (actor: EffectActor<typeof schedulerMachine>) =>
  waitFor(
    actor,
    (snapshot) =>
      snapshot.matches('running.jobs.waiting') &&
      snapshot.context.waits.scan > 0 &&
      snapshot.context.waits.identity > 0,
  )

describe('scheduler machine', () => {
  it('runs auth, scan, identity, then maintenance on boot and repeats cadences', async () => {
    const harness = makeHarness({})

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* createEffectActor(schedulerMachine, { input: input() })

          yield* waitForJobs(actor)
          yield* expectCall(harness.calls, 'migrate', 0)
          yield* expectCall(harness.calls, 'status', 0)
          yield* expectCall(harness.calls, 'auth', 0)
          yield* expectCall(harness.calls, 'scan', 0)
          yield* expectCall(harness.calls, 'identity', 0)

          yield* TestClock.adjust(minutes(10))
          yield* expectCall(harness.calls, 'maintenance', minutes(10))

          yield* waitFor(
            actor,
            (snapshot) =>
              snapshot.matches('running.jobs.waiting') && snapshot.context.waits.maintenance > 0,
          )
          yield* TestClock.adjust(minutes(5))
          yield* expectCall(harness.calls, 'identity', minutes(15))
        }),
      ).pipe(Effect.provide(harness.layer)),
    )
  })

  it('recovers interrupted runs on boot when configured', async () => {
    const harness = makeHarness({})

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* createEffectActor(schedulerMachine, { input: input({ recoverOnBoot: true }) })
          yield* expectCall(harness.calls, 'migrate', 0)
          yield* expectCall(harness.calls, 'recover', 0)
          yield* expectCall(harness.calls, 'status', 0)
        }),
      ).pipe(Effect.provide(harness.layer)),
    )
  })

  it('waits for the remaining scan interval reported at boot', async () => {
    const harness = makeHarness({
      jobs: (record) => ({
        status: record('status').pipe(
          Effect.andThen(Clock.currentTimeMillis),
          Effect.map((now) => ({ latestSuccessfulAt: now - 3 * HOUR_MS })),
        ),
      }),
    })
    const isolated = input({
      policy: { ...policy, authRefreshMs: 24 * HOUR_MS, identityActiveMs: 24 * HOUR_MS },
    })

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* createEffectActor(schedulerMachine, { input: isolated })

          yield* waitForJobs(actor)
          yield* expectCall(harness.calls, 'migrate', 0)
          yield* expectCall(harness.calls, 'status', 0)
          yield* expectCall(harness.calls, 'auth', 0)
          yield* expectCall(harness.calls, 'identity', 0)

          yield* TestClock.adjust(3 * HOUR_MS)
          yield* expectCall(harness.calls, 'maintenance', minutes(10))
          yield* expectCall(harness.calls, 'scan', 3 * HOUR_MS)
        }),
      ).pipe(Effect.provide(harness.layer)),
    )
  })

  it('sleeps until the daily budget reset after an exhausted identity pass', async () => {
    const harness = makeHarness({
      jobs: (record) => ({
        identity: record('identity').pipe(
          Effect.andThen(
            Effect.succeed<IdentityResult>({
              outcome: { kind: 'ran', tried: 1, budgetRemaining: 0 },
              budgetResetsInMs: minutes(65),
            }),
          ),
        ),
      }),
    })

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* createEffectActor(schedulerMachine, { input: input() })

          yield* waitForJobs(actor)
          yield* expectCall(harness.calls, 'migrate', 0)
          yield* expectCall(harness.calls, 'status', 0)
          yield* expectCall(harness.calls, 'auth', 0)
          yield* expectCall(harness.calls, 'scan', 0)
          yield* expectCall(harness.calls, 'identity', 0)

          yield* TestClock.adjust(minutes(10))
          yield* expectCall(harness.calls, 'maintenance', minutes(10))
          yield* TestClock.adjust(minutes(35))
          yield* expectCall(harness.calls, 'auth', minutes(45))
          yield* TestClock.adjust(minutes(20))
          yield* expectCall(harness.calls, 'identity', minutes(65))
        }),
      ).pipe(Effect.provide(harness.layer)),
    )
  })

  it('backs off to the idle interval when an identity pass fails', async () => {
    const harness = makeHarness({
      jobs: (record) => ({
        identity: record('identity').pipe(
          Effect.andThen(
            Effect.fail(
              new JobError({ message: 'riot unavailable', command: 'identity', exitCode: 1 }),
            ),
          ),
        ),
      }),
    })

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* createEffectActor(schedulerMachine, { input: input() })

          yield* waitForJobs(actor)
          yield* expectCall(harness.calls, 'migrate', 0)
          yield* expectCall(harness.calls, 'status', 0)
          yield* expectCall(harness.calls, 'auth', 0)
          yield* expectCall(harness.calls, 'scan', 0)
          yield* expectCall(harness.calls, 'identity', 0)

          yield* TestClock.adjust(minutes(10))
          yield* expectCall(harness.calls, 'maintenance', minutes(10))
          yield* TestClock.adjust(minutes(20))
          yield* expectCall(harness.calls, 'identity', minutes(30))
        }),
      ).pipe(Effect.provide(harness.layer)),
    )
  })

  it('retries a skipped identity pass after one minute', async () => {
    const harness = makeHarness({
      jobs: (record) => ({
        identity: record('identity').pipe(
          Effect.andThen(
            Effect.succeed<IdentityResult>({
              outcome: { kind: 'skipped' },
              budgetResetsInMs: minutes(60),
            }),
          ),
        ),
      }),
    })

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* createEffectActor(schedulerMachine, { input: input() })

          yield* waitForJobs(actor)
          yield* expectCall(harness.calls, 'migrate', 0)
          yield* expectCall(harness.calls, 'status', 0)
          yield* expectCall(harness.calls, 'auth', 0)
          yield* expectCall(harness.calls, 'scan', 0)
          yield* expectCall(harness.calls, 'identity', 0)

          yield* TestClock.adjust(minutes(1))
          yield* expectCall(harness.calls, 'identity', minutes(1))
        }),
      ).pipe(Effect.provide(harness.layer)),
    )
  })

  it('retries a failed scan on the configured interval', async () => {
    const harness = makeHarness({
      jobs: (record) => ({
        scan: record('scan').pipe(
          Effect.andThen(
            Effect.fail(new JobError({ message: 'riot down', command: 'scan', exitCode: 1 })),
          ),
        ),
      }),
    })
    const isolated = input({
      policy: { ...policy, authRefreshMs: 24 * HOUR_MS, identityActiveMs: 24 * HOUR_MS },
    })

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* createEffectActor(schedulerMachine, { input: isolated })

          yield* waitForJobs(actor)
          yield* expectCall(harness.calls, 'migrate', 0)
          yield* expectCall(harness.calls, 'status', 0)
          yield* expectCall(harness.calls, 'auth', 0)
          yield* expectCall(harness.calls, 'scan', 0)
          yield* expectCall(harness.calls, 'identity', 0)

          yield* TestClock.adjust(minutes(10))
          yield* expectCall(harness.calls, 'maintenance', minutes(10))

          yield* waitFor(
            actor,
            (snapshot) =>
              snapshot.matches('running.jobs.waiting') && snapshot.context.waits.maintenance > 0,
          )
          yield* TestClock.adjust(6 * HOUR_MS - minutes(10))
          yield* expectCall(harness.calls, 'scan', 6 * HOUR_MS)
        }),
      ).pipe(Effect.provide(harness.layer)),
    )
  })

  it('stops cleanly and interrupts the running job', async () => {
    const harness = makeHarness({
      jobs: (record) => ({
        scan: record('scan').pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Ref.update(harness.interrupted, (jobs) => [...jobs, 'scan'])),
        ),
      }),
    })

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* createEffectActor(schedulerMachine, { input: input() })
          yield* waitFor(actor, (snapshot) => snapshot.matches('running.jobs.scan'))

          actor.send({ type: 'STOP', signal: 'SIGTERM' })
          const output = yield* join(actor)

          expect(output).toEqual({ exitCode: 0 })
          expect(yield* Ref.get(harness.interrupted)).toEqual(['scan'])
        }),
      ).pipe(Effect.provide(harness.layer)),
    )
  })

  it('stops with a failure when the API child exits', async () => {
    const harness = makeHarness({
      jobs: (record) => ({
        scan: record('scan').pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Ref.update(harness.interrupted, (jobs) => [...jobs, 'scan'])),
        ),
      }),
      supervise: Effect.sleep('5 seconds').pipe(Effect.as({ code: 1 })),
    })

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* createEffectActor(schedulerMachine, { input: input() })
          yield* waitFor(actor, (snapshot) => snapshot.matches('running.jobs.scan'))

          yield* TestClock.adjust('5 seconds')
          const output = yield* join(actor)

          expect(output).toEqual({ exitCode: 1 })
          expect(yield* Ref.get(harness.interrupted)).toEqual(['scan'])
        }),
      ).pipe(Effect.provide(harness.layer)),
    )
  })

  it('supervises the API without running jobs when jobs are disabled', async () => {
    const harness = makeHarness({})

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* createEffectActor(schedulerMachine, {
            input: input({ jobsEnabled: false }),
          })
          yield* waitFor(actor, (snapshot) => snapshot.matches('running.jobs.disabled'))

          yield* expectCall(harness.calls, 'migrate', 0)
          yield* expectCall(harness.calls, 'status', 0)
          yield* TestClock.adjust(24 * HOUR_MS)

          expect(yield* Queue.size(harness.calls)).toBe(0)
          expect(actor.getSnapshot().matches('running.jobs.disabled')).toBe(true)
        }),
      ).pipe(Effect.provide(harness.layer)),
    )
  })

  it('exits with a failure when boot fails', async () => {
    const harness = makeHarness({
      jobs: (record) => ({
        migrate: record('migrate').pipe(
          Effect.andThen(
            Effect.fail(
              new JobError({ message: 'no database', command: 'db:migrate', exitCode: 1 }),
            ),
          ),
        ),
      }),
    })

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* createEffectActor(schedulerMachine, { input: input() })
          const output = yield* join(actor)
          expect(output).toEqual({ exitCode: 1 })
        }),
      ).pipe(Effect.provide(harness.layer)),
    )
  })
})
