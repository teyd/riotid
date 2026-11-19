#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalDateInEffect:off
import { spawn, type ChildProcess } from 'node:child_process'

import { AppConfig, repoRoot } from '@riotid/config'
import { Effect, Layer } from 'effect'

import { apiEntry, makeCliRunner, stopChild } from './jobs.ts'
import { schedulerJobsLayer } from './jobs-service.ts'
import { ApiProcess, runScheduler, type SchedulerInput } from './machine.ts'
import { HOUR_MS, MINUTE_MS } from './schedule.ts'

const apiStopTimeoutMs = 5_000
const controller = new AbortController()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    process.stderr.write(`scheduler stopping (${signal})\n`)
    controller.abort()
  })
}

const apiProcessLayer = (options: { readonly dryRun: boolean }): Layer.Layer<ApiProcess> =>
  Layer.succeed(ApiProcess, {
    supervise: options.dryRun
      ? Effect.gen(function* () {
          yield* Effect.logInfo(`[dry-run] node ${apiEntry}`)
          return yield* Effect.callback<never>((_resume) => {
            const timer = setInterval(() => {}, 3_600_000)
            return Effect.sync(() => clearInterval(timer))
          })
        })
      : Effect.acquireUseRelease(
          Effect.sync(() =>
            spawn(process.execPath, [apiEntry], {
              cwd: repoRoot,
              env: process.env,
              stdio: 'inherit',
            }),
          ),
          (child: ChildProcess) =>
            Effect.callback<{ readonly code: number | null }, never>((resume) => {
              if (child.exitCode !== null) {
                resume(Effect.succeed({ code: child.exitCode }))
                return
              }

              let settled = false
              const finish = (code: number | null) => {
                if (settled) return
                settled = true
                resume(Effect.succeed({ code }))
              }
              const onExit = (code: number | null) => finish(code)
              const onError = () => finish(null)

              child.once('exit', onExit)
              child.once('error', onError)

              return Effect.sync(() => {
                child.off('exit', onExit)
                child.off('error', onError)
              })
            }),
          (child) => stopChild(child, apiStopTimeoutMs),
        ).pipe(
          Effect.tap((result) =>
            Effect.logWarning(`api exited (${result.code ?? 'signal'}); stopping the scheduler`),
          ),
        ),
  })

const policyFor = (config: AppConfig): SchedulerInput['policy'] => ({
  authRefreshMs: config.authRefreshMinutes * MINUTE_MS,
  scanIntervalMs: config.scanIntervalHours * HOUR_MS,
  identityActiveMs: config.identityActiveMinutes * MINUTE_MS,
  identityIdleMs: config.identityIdleMinutes * MINUTE_MS,
  maintenanceIntervalMs: config.maintenanceIntervalHours * HOUR_MS,
})

const main = Effect.gen(function* () {
  const config = yield* AppConfig
  const runner = makeCliRunner({ dryRun: config.dryRun })
  const layer = Layer.mergeAll(
    schedulerJobsLayer({ config, runner }),
    apiProcessLayer({ dryRun: config.dryRun }),
  )

  yield* Effect.logInfo(`scheduler starting (${config.nodeEnv})`)

  const output = yield* runScheduler({
    input: {
      jobsEnabled: config.nodeEnv === 'production' && config.jobsEnabled,
      recoverOnBoot: config.nodeEnv === 'production',
      maintenanceDelayMs: config.maintenanceDelayMinutes * MINUTE_MS,
      policy: policyFor(config),
    },
    signal: controller.signal,
  }).pipe(Effect.provide(layer))

  const exitCode = output?.exitCode ?? 0
  yield* Effect.logInfo(`scheduler stopped (exit ${exitCode})`)

  if (exitCode !== 0) {
    process.exitCode = exitCode
  }
}).pipe(Effect.scoped)

Effect.runPromise(main).catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`)
  process.exitCode = 1
})
