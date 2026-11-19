#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalDateInEffect:off
import { spawn, type ChildProcess } from 'node:child_process'

import { AppConfig, repoRoot } from '@riotid/config'
import { Clock, Deferred, Effect, Option, Ref, Semaphore } from 'effect'

import { apiEntry, type CliRunner, makeCliRunner } from './jobs.ts'
import { HOUR_MS, type IdentityOutcome, MINUTE_MS, identityDelay, scanDelayMs } from './schedule.ts'

type StatusPayload = {
  readonly stats: { readonly latestSuccessfulRunAt: number | null } | null
}

type ResolvePayload = {
  readonly tried: number
  readonly budgetRemaining: number
  readonly budgetUsed: number
}

const apiStopTimeoutMs = 5_000

const attempt = <A>(label: string, effect: Effect.Effect<A | null, unknown>) =>
  effect.pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning(`${label} failed: ${String(cause)}`).pipe(Effect.as(null)),
    ),
  )

const spawnApi = (dryRun: boolean): ChildProcess | null => {
  if (dryRun) {
    process.stderr.write(`[dry-run] node ${apiEntry}\n`)
    return null
  }

  return spawn(process.execPath, [apiEntry], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  })
}

const stopApi = (child: ChildProcess | null) =>
  Effect.callback<void>((resume) => {
    if (!child || child.exitCode !== null) {
      resume(Effect.void)
      return
    }

    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      resume(Effect.void)
    }

    child.once('exit', finish)
    child.kill('SIGTERM')
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish()
    }, apiStopTimeoutMs)

    return Effect.sync(() => clearTimeout(timer))
  })

const watchApi = (child: ChildProcess | null, shutdown: Deferred.Deferred<void>) => {
  if (!child) return Effect.void

  return Effect.callback<string>((resume) => {
    child.once('exit', (code, signal) => {
      resume(Effect.succeed(`${code ?? signal ?? 'unknown'}`))
    })
  }).pipe(
    Effect.flatMap((reason) =>
      Effect.logWarning(`api exited (${reason}); stopping the scheduler`).pipe(
        Effect.andThen(Deferred.succeed(shutdown, undefined)),
      ),
    ),
  )
}

const scanLoop = (
  runner: CliRunner,
  config: AppConfig,
  scanRunning: Ref.Ref<boolean>,
  lock: Semaphore.Semaphore,
) =>
  Effect.gen(function* () {
    while (true) {
      const status = yield* attempt('status', runner.run<StatusPayload>(['status', '--json']))
      const now = yield* Clock.currentTimeMillis
      const delay = scanDelayMs({
        latestSuccessfulAt: status?.stats?.latestSuccessfulRunAt ?? null,
        now,
        intervalHours: config.scanIntervalHours,
      })

      if (delay > 0) {
        yield* Effect.logInfo(`next scan in ${Math.ceil(delay / MINUTE_MS)} minutes`)
      }

      yield* Effect.sleep(delay)

      const result = yield* lock.withPermits(1)(
        Ref.set(scanRunning, true).pipe(
          Effect.andThen(Effect.logInfo('scheduled scan starting')),
          Effect.andThen(attempt('scan', runner.run(['scan', '--json']))),
          Effect.ensuring(Ref.set(scanRunning, false)),
        ),
      )

      if (result === null) {
        yield* Effect.sleep(config.scanIntervalHours * HOUR_MS)
      }
    }
  })

const identityPass = (
  runner: CliRunner,
  config: AppConfig,
  scanRunning: Ref.Ref<boolean>,
  lock: Semaphore.Semaphore,
) =>
  Effect.gen(function* () {
    if (yield* Ref.get(scanRunning)) {
      return { kind: 'skipped' } satisfies IdentityOutcome
    }

    const result = yield* lock.withPermitsIfAvailable(1)(
      attempt(
        'anon:resolve',
        runner.run<ResolvePayload>([
          'anon:resolve',
          '--limit',
          String(config.identityLimit),
          '--json',
        ]),
      ),
    )

    if (Option.isNone(result) || result.value === null) {
      return config.dryRun
        ? ({ kind: 'skipped' } satisfies IdentityOutcome)
        : ({ kind: 'failed' } satisfies IdentityOutcome)
    }

    return {
      kind: 'ran',
      tried: result.value.tried,
      budgetRemaining: result.value.budgetRemaining,
    } satisfies IdentityOutcome
  })

const identityLoop = (
  runner: CliRunner,
  config: AppConfig,
  scanRunning: Ref.Ref<boolean>,
  lock: Semaphore.Semaphore,
) =>
  Effect.gen(function* () {
    while (true) {
      const outcome = yield* identityPass(runner, config, scanRunning, lock)
      const now = yield* Clock.currentTimeMillis
      const { delayMs, reason } = identityDelay({
        outcome,
        now,
        activeMinutes: config.identityActiveMinutes,
        idleMinutes: config.identityIdleMinutes,
      })

      yield* Effect.logInfo(
        `identity: ${reason}; next pass in ${Math.ceil(delayMs / MINUTE_MS)} minutes`,
      )
      yield* Effect.sleep(delayMs)
    }
  })

const maintenanceLoop = (runner: CliRunner, config: AppConfig, lock: Semaphore.Semaphore) =>
  Effect.gen(function* () {
    yield* Effect.sleep(config.maintenanceDelayMinutes * MINUTE_MS)

    while (true) {
      const ran = yield* lock.withPermitsIfAvailable(1)(
        Effect.gen(function* () {
          const backup = yield* attempt('backup', runner.run(['backup', '--json']))
          const prune = yield* attempt('db:prune', runner.run(['db:prune', '--json']))
          return backup !== null && prune !== null
        }),
      )

      if (Option.isNone(ran)) {
        yield* Effect.logInfo('maintenance skipped: another job is running; retrying in 10 minutes')
        yield* Effect.sleep(10 * MINUTE_MS)
        continue
      }

      yield* Effect.sleep(config.maintenanceIntervalHours * HOUR_MS)
    }
  })

const authLoop = (runner: CliRunner, config: AppConfig) =>
  Effect.gen(function* () {
    while (true) {
      yield* attempt('auth:refresh', runner.run(['auth:refresh', '--json']))
      yield* Effect.sleep(config.authRefreshMinutes * MINUTE_MS)
    }
  })

const shutdown = Deferred.makeUnsafe<void>()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    Deferred.doneUnsafe(shutdown, Effect.void)
  })
}

const main = Effect.gen(function* () {
  const config = yield* AppConfig
  const runner = makeCliRunner({ dryRun: config.dryRun })
  const lock = yield* Semaphore.make(1)
  const scanRunning = yield* Ref.make(false)

  yield* Effect.logInfo(`scheduler starting (${config.nodeEnv})`)

  yield* runner.run(['db:migrate', '--json'])

  if (config.nodeEnv === 'production') {
    yield* runner.run(['db:recover', '--json'])
  }

  const api = yield* Effect.acquireRelease(
    Effect.sync(() => spawnApi(config.dryRun)),
    stopApi,
  )

  yield* Effect.forkScoped(watchApi(api, shutdown))

  if (config.nodeEnv === 'production' && config.jobsEnabled) {
    yield* Effect.forkScoped(scanLoop(runner, config, scanRunning, lock))
    yield* Effect.forkScoped(identityLoop(runner, config, scanRunning, lock))
    yield* Effect.forkScoped(maintenanceLoop(runner, config, lock))
  }

  if (config.jobsEnabled) {
    yield* Effect.forkScoped(authLoop(runner, config))
  }

  yield* Effect.logInfo(`scheduler running (scan every ${config.scanIntervalHours}h)`)
  yield* Deferred.await(shutdown)
  yield* Effect.logInfo('scheduler shutting down')
})

Effect.runPromise(Effect.scoped(main)).catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`)
  process.exitCode = 1
})
