// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalDateInEffect:off
import { AppConfig } from '@riotid/config'
import { Context, Effect, Layer } from 'effect'

import type { CliRunner } from './jobs.ts'
import type { IdentityOutcome } from './schedule.ts'
import { MINUTE_MS, nextBudgetResetAt } from './schedule.ts'

export class SchedulerJobs extends Context.Service<SchedulerJobs, SchedulerJobsShape>()(
  'SchedulerJobs',
) {}

export type ScanPayload = { readonly players?: number }
export type ResolvePayload = {
  readonly tried: number
  readonly budgetRemaining: number
}
export type StatusPayload = {
  readonly stats: { readonly latestSuccessfulRunAt: number | null } | null
}

export type IdentityResult = {
  readonly outcome: IdentityOutcome
  readonly budgetResetsInMs: number
}

export type SchedulerJobsShape = {
  readonly migrate: Effect.Effect<void, unknown>
  readonly recover: Effect.Effect<void, unknown>
  readonly status: Effect.Effect<{ readonly latestSuccessfulAt: number | null }, unknown>
  readonly scan: Effect.Effect<{ readonly players: number }, unknown>
  readonly identity: Effect.Effect<IdentityResult, unknown>
  readonly maintenance: Effect.Effect<void, never>
  readonly auth: Effect.Effect<void, unknown>
}

const attempt = <A>(label: string, effect: Effect.Effect<A | null, unknown>) =>
  effect.pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning(`${label} failed: ${String(cause)}`).pipe(Effect.as(null)),
    ),
  )

const logged = <A, E>(label: string, effect: Effect.Effect<A, E>) =>
  effect.pipe(Effect.tapError((error) => Effect.logWarning(`${label} failed: ${String(error)}`)))

export const schedulerJobsLayer = (options: {
  readonly config: AppConfig
  readonly runner: CliRunner
}): Layer.Layer<SchedulerJobs> => {
  const { config, runner } = options

  return Layer.succeed(SchedulerJobs, {
    migrate: runner.run(['db:migrate', '--json']).pipe(Effect.asVoid),
    recover: runner.run(['db:recover', '--json']).pipe(Effect.asVoid),
    status: runner.run<StatusPayload>(['status', '--json']).pipe(
      Effect.map((payload) => ({
        latestSuccessfulAt: payload?.stats?.latestSuccessfulRunAt ?? null,
      })),
    ),
    scan: logged(
      'scan',
      Effect.logInfo('scheduled scan starting').pipe(
        Effect.andThen(runner.run<ScanPayload>(['scan', '--json'])),
        Effect.tap((payload) => Effect.logInfo(`scan finished: ${payload?.players ?? 0} players`)),
        Effect.map((payload) => ({ players: payload?.players ?? 0 })),
      ),
    ),
    identity: Effect.gen(function* () {
      const payload = yield* runner.run<ResolvePayload>([
        'anon:resolve',
        '--limit',
        String(config.identityLimit),
        '--json',
      ])
      const now = yield* Effect.clockWith((clock) => clock.currentTimeMillis)

      if (payload === null) {
        yield* Effect.logInfo('identity pass: skipped')
        return {
          outcome: { kind: 'skipped' } satisfies IdentityOutcome,
          budgetResetsInMs: MINUTE_MS,
        }
      }

      yield* Effect.logInfo(
        `identity pass: tried ${payload.tried}, budget remaining ${payload.budgetRemaining}`,
      )
      return {
        outcome: {
          kind: 'ran',
          tried: payload.tried,
          budgetRemaining: payload.budgetRemaining,
        } satisfies IdentityOutcome,
        budgetResetsInMs: Math.max(MINUTE_MS, nextBudgetResetAt(now) - now),
      }
    }),
    maintenance: Effect.gen(function* () {
      yield* Effect.logInfo('maintenance starting')
      yield* attempt('backup', runner.run(['backup', '--json']))
      yield* attempt('db:prune', runner.run(['db:prune', '--json']))
    }).pipe(Effect.asVoid),
    auth: logged(
      'auth:refresh',
      Effect.logInfo('auth refresh starting').pipe(
        Effect.andThen(runner.run(['auth:refresh', '--json'])),
        Effect.asVoid,
      ),
    ),
  })
}
