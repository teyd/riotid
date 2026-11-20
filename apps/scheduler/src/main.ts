#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalDateInEffect:off
import { spawn, type ChildProcess } from 'node:child_process'

import { AppConfig, repoRoot } from '@riotid/config'
import { Clock, Deferred, Effect } from 'effect'

import { apiEntry, type CliRunner, makeCliRunner, type TickResult } from './jobs.ts'

const MINUTE_MS = 60_000
const apiStopTimeoutMs = 5_000
let shuttingDown = false

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
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      resume(Effect.succeed(`${code ?? signal ?? 'unknown'}`))
    }

    child.once('exit', onExit)
    return Effect.sync(() => child.off('exit', onExit))
  }).pipe(
    Effect.flatMap((reason) =>
      shuttingDown
        ? Effect.void
        : Effect.logWarning(`api exited (${reason}); stopping the scheduler`).pipe(
            Effect.andThen(Effect.sync(() => (process.exitCode = 1))),
            Effect.andThen(Deferred.succeed(shutdown, undefined)),
          ),
    ),
  )
}

const tickLoop = (runner: CliRunner, bootedAt: number) =>
  Effect.gen(function* () {
    while (true) {
      const result = yield* attempt(
        'tick',
        runner.run<TickResult>(['work:tick', '--json', '--booted-at', String(bootedAt)]),
      )

      if (result && (result.job !== null || !result.ok)) {
        yield* Effect.logInfo(`work: ${result.job ?? 'none'} · ${result.reason}`)
      }

      yield* Effect.sleep(MINUTE_MS)
    }
  })

const shutdown = Deferred.makeUnsafe<void>()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    shuttingDown = true
    Deferred.doneUnsafe(shutdown, Effect.void)
  })
}

const main = Effect.gen(function* () {
  const config = yield* AppConfig
  const runner = makeCliRunner({ dryRun: config.dryRun })
  const bootedAt = yield* Clock.currentTimeMillis

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

  const scheduled = config.nodeEnv === 'production' && config.jobsEnabled

  if (scheduled) {
    yield* Effect.forkScoped(tickLoop(runner, bootedAt))
  }

  // SCHEDULER_JOBS=false keeps the API supervised without running scheduled work.
  yield* Effect.logInfo(
    scheduled ? 'scheduler running (one tick per minute)' : 'scheduler running (jobs disabled)',
  )
  yield* Deferred.await(shutdown)
  yield* Effect.logInfo('scheduler shutting down')
})

Effect.runPromise(Effect.scoped(main)).catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`)
  process.exitCode = 1
})
