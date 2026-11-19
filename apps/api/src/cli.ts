#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalDateInEffect:off globalJsonInEffect:off
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import * as NodeHttpClient from '@effect/platform-node/NodeHttpClient'
import {
  backupDatabase,
  checkDatabase,
  Database,
  databaseStats,
  migrateDatabase,
  pruneRuns,
  readDatabase,
  seedDatabase,
  writeDatabase,
} from '@riotid/db'
import { RiotSourceLive, scan } from '@riotid/ingest'
import { serve } from '@hono/node-server'
import {
  loadCookieFile,
  parseCookieInput,
  qrLogin,
  reauth,
  refreshSession,
  refreshSessionIfStale,
  RiotAuthError,
  saveCookieFile,
  type AuthSession,
} from '@riotid/riot'
import { Clock, Config, Effect, Layer } from 'effect'

import { makeApp } from './app.ts'
import { runProbe } from './probe.ts'

const require = createRequire(import.meta.url)
const qrcode = require('qrcode-terminal') as {
  generate: (input: string, options: { small: boolean }, callback: (code: string) => void) => void
}

const AppConfig = Config.all({
  port: Config.Int('PORT').pipe(Config.withDefault(8787)),
  publicOrigin: Config.String('PUBLIC_ORIGIN').pipe(Config.withDefault('http://localhost:5173')),
  cookieFile: Config.String('COOKIE_FILE').pipe(Config.withDefault('./data/cookies.json')),
  databasePath: Config.String('DATABASE_PATH').pipe(Config.withDefault('./data/riotid.db')),
  nodeEnv: Config.String('NODE_ENV').pipe(Config.withDefault('development')),
  countryCode: Config.String('RIOT_COUNTRY_CODE').pipe(Config.withDefault('US')),
  qrTimeoutSeconds: Config.Int('RIOT_QR_TIMEOUT_SECONDS').pipe(Config.withDefault(300)),
  authRefreshMinutes: Config.Int('AUTH_REFRESH_MINUTES').pipe(Config.withDefault(45)),
  scanIntervalHours: Config.Int('SCAN_INTERVAL_HOURS').pipe(Config.withDefault(6)),
  backupDirectory: Config.String('BACKUP_DIRECTORY').pipe(Config.withDefault('./data/backups')),
  backupKeepDays: Config.Int('BACKUP_KEEP_DAYS').pipe(Config.withDefault(7)),
  runRetentionDays: Config.Int('RUN_RETENTION_DAYS').pipe(Config.withDefault(180)),
})

const help = `riotid

Usage:
  riotid serve                 Start the API
  riotid status                Show readiness and auth state
  riotid auth:login            Sign in with a Riot Mobile QR code
  riotid auth:save [file]      Import a pasted cookie jar (or read stdin)
  riotid auth:check            Verify the stored cookie jar
  riotid auth:refresh          Refresh tokens and persist the cookie jar
  riotid probe                 Probe live leaderboard/name/match endpoints
  riotid db:migrate            Apply committed database migrations
  riotid db:seed               Seed synthetic development data
  riotid db:check              Check database invariants
  riotid scan                 Run one leaderboard scan
  riotid help                  Show this help
`

const printSession = (session: AuthSession, cookieFile: string) =>
  Effect.logInfo(
    `Authenticated ${session.puuid} · region ${session.region} · token expires ${new Date(
      session.expiresAt,
    ).toISOString()} · jar ${cookieFile}`,
  )

const renderQr = (url: string) =>
  Effect.sync(() => {
    process.stdout.write(`\nScan with the Riot Mobile app:\n${url}\n\n`)
    qrcode.generate(url, { small: true }, (code) => process.stdout.write(`${code}\n`))
  })

const authLogin = Effect.gen(function* () {
  const config = yield* AppConfig
  const cookies = yield* qrLogin({
    countryCode: config.countryCode,
    timeoutSeconds: config.qrTimeoutSeconds,
    onUrl: renderQr,
  })
  const session = yield* reauth(cookies)

  yield* saveCookieFile(config.cookieFile, session.cookies, 'qr')
  yield* printSession(session, config.cookieFile)
})

const authSave = Effect.gen(function* () {
  const config = yield* AppConfig
  const sourcePath = process.argv[3]
  const input = sourcePath ? readFileSync(sourcePath, 'utf8') : readFileSync(0, 'utf8')
  const cookies = parseCookieInput(input)

  if (Object.keys(cookies).length === 0) {
    return yield* new RiotAuthError({
      message: 'No cookies were found in the input.',
    })
  }

  const session = yield* reauth(cookies)

  yield* saveCookieFile(config.cookieFile, session.cookies, 'paste')
  yield* printSession(session, config.cookieFile)
})

const authCheck = Effect.gen(function* () {
  const config = yield* AppConfig
  const session = yield* refreshSession(config.cookieFile)

  yield* printSession(session, config.cookieFile)
})

const migrationsFolder = fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url))
const jsonOutput = process.argv.includes('--json')
const printJson = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`)

const dbMigrate = Effect.gen(function* () {
  const config = yield* AppConfig

  yield* migrateDatabase(migrationsFolder).pipe(Effect.provide(writeDatabase(config.databasePath)))
  yield* Effect.logInfo(`database migrated at ${config.databasePath}`)
})

const dbSeed = Effect.gen(function* () {
  const config = yield* AppConfig

  if (config.nodeEnv === 'production') {
    yield* Effect.logWarning('refusing to seed a production database')
    process.exitCode = 1
    return
  }

  yield* migrateDatabase(migrationsFolder).pipe(Effect.provide(writeDatabase(config.databasePath)))
  const result = yield* seedDatabase.pipe(Effect.provide(writeDatabase(config.databasePath)))

  yield* Effect.logInfo(
    result.seeded ? `seeded ${config.databasePath} (run ${result.runId})` : 'seed already applied',
  )
})

const scanOnce = (
  config: { cookieFile: string; databasePath: string },
  trigger: 'schedule' | 'manual' | 'boot',
) =>
  Effect.gen(function* () {
    const session = yield* refreshSession(config.cookieFile)
    return yield* scan({ session, trigger })
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        writeDatabase(config.databasePath),
        RiotSourceLive.pipe(Layer.provide(NodeHttpClient.layerNodeHttp)),
      ),
    ),
  )

const scanCommand = Effect.gen(function* () {
  const config = yield* AppConfig

  yield* migrateDatabase(migrationsFolder).pipe(Effect.provide(writeDatabase(config.databasePath)))
  const result = yield* scanOnce(config, 'manual')

  if (jsonOutput) {
    printJson(result)
  } else {
    yield* Effect.logInfo(`scan complete: ${JSON.stringify(result)}`)
  }
})

const statsCommand = Effect.gen(function* () {
  const config = yield* AppConfig
  const stats = yield* databaseStats.pipe(Effect.provide(readDatabase(config.databasePath)))

  if (jsonOutput) {
    printJson(stats)
  } else {
    yield* Effect.logInfo(JSON.stringify(stats, null, 2))
  }
})

const backupCommand = Effect.gen(function* () {
  const config = yield* AppConfig
  const result = yield* backupDatabase({
    source: config.databasePath,
    directory: config.backupDirectory,
    keepDays: config.backupKeepDays,
  })

  if (jsonOutput) {
    printJson(result)
  } else {
    yield* Effect.logInfo(
      `backup: ${result.path} (${result.bytes} bytes, pruned ${result.pruned.length})`,
    )
  }
})

const pruneCommand = Effect.gen(function* () {
  const config = yield* AppConfig
  const result = yield* pruneRuns({ olderThanDays: config.runRetentionDays }).pipe(
    Effect.provide(writeDatabase(config.databasePath)),
  )

  if (jsonOutput) {
    printJson(result)
  } else {
    yield* Effect.logInfo(`pruned ${result.deleted} runs older than ${result.cutoff}`)
  }
})

const dbCheck = Effect.gen(function* () {
  const config = yield* AppConfig
  const report = yield* checkDatabase.pipe(Effect.provide(readDatabase(config.databasePath)))

  yield* Effect.logInfo(`database check: ${report.ok ? 'ok' : 'failed'}`)
  yield* Effect.logInfo(`integrity: ${report.integrity}`)

  for (const issue of report.issues) {
    yield* Effect.logWarning(issue)
  }

  if (!report.ok) {
    process.exitCode = 1
  }
})

const status = Effect.gen(function* () {
  const config = yield* AppConfig
  const file = yield* loadCookieFile(config.cookieFile)
  const stats = yield* databaseStats.pipe(
    Effect.provide(readDatabase(config.databasePath)),
    Effect.orElseSucceed(() => null),
  )

  if (jsonOutput) {
    printJson({
      port: config.port,
      database: config.databasePath,
      cookieFile: config.cookieFile,
      cookieSource: file?.source ?? null,
      cookieUpdatedAt: file?.updatedAt ?? null,
      stats,
    })
    return
  }

  yield* Effect.logInfo(`riotid api ready on port ${config.port}`)
  yield* Effect.logInfo(
    file
      ? `cookie jar: ${config.cookieFile} · source ${file.source} · updated ${file.updatedAt}`
      : `cookie jar: missing at ${config.cookieFile} · run \`riotid auth:login\``,
  )

  if (stats) {
    yield* Effect.logInfo(
      `data: ${stats.players} players · ${stats.anonymous} anonymous (${stats.unresolvedAnonymous} unresolved) · ${stats.runs} runs · latest ${stats.latestRun?.status ?? 'none'}`,
    )
  }
})

const main = Effect.gen(function* () {
  const command = process.argv[2] ?? 'serve'

  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(help)
    return
  }

  if (command === 'status') {
    yield* status
    return
  }

  if (command === 'auth:login') {
    yield* authLogin
    return
  }

  if (command === 'auth:save') {
    yield* authSave
    return
  }

  if (command === 'auth:check' || command === 'auth:refresh') {
    yield* authCheck
    return
  }

  if (command === 'probe') {
    const config = yield* AppConfig
    yield* runProbe(config.cookieFile).pipe(Effect.provide(NodeHttpClient.layerNodeHttp))
    return
  }

  if (command === 'db:migrate') {
    yield* dbMigrate
    return
  }

  if (command === 'db:seed') {
    yield* dbSeed
    return
  }

  if (command === 'db:check') {
    yield* dbCheck
    return
  }

  if (command === 'scan') {
    yield* scanCommand
    return
  }

  if (command === 'stats') {
    yield* statsCommand
    return
  }

  if (command === 'backup') {
    yield* backupCommand
    return
  }

  if (command === 'db:prune') {
    yield* pruneCommand
    return
  }

  if (command !== 'serve') {
    process.stderr.write(`Unknown command: ${command}\n\n${help}`)
    process.exitCode = 2
    return
  }

  const config = yield* AppConfig

  yield* migrateDatabase(migrationsFolder).pipe(Effect.provide(writeDatabase(config.databasePath)))

  const app = makeApp()

  yield* Effect.logInfo(`riotid api listening on http://localhost:${config.port}`)
  yield* Effect.logInfo(`public origin: ${config.publicOrigin}`)

  serve({ fetch: app.fetch, port: config.port })

  if (config.nodeEnv === 'production') {
    yield* Effect.forkDetach(
      Effect.gen(function* () {
        const intervalMs = config.scanIntervalHours * 60 * 60 * 1000
        const latest = yield* Effect.gen(function* () {
          const db = yield* Database
          return yield* db.get<{ finished_at: number | null }>(
            `select finished_at from runs where status = 'succeeded' order by finished_at desc limit 1`,
          )
        }).pipe(Effect.provide(writeDatabase(config.databasePath)))
        const now = yield* Clock.currentTimeMillis
        const shouldScan = !latest?.finished_at || now - latest.finished_at >= intervalMs

        if (shouldScan) {
          yield* scanOnce(config, 'boot').pipe(
            Effect.tap((result) => Effect.logInfo(`boot scan: ${JSON.stringify(result)}`)),
            Effect.catch((error) => Effect.logWarning(`boot scan failed: ${String(error)}`)),
          )
        }

        while (true) {
          yield* Effect.sleep(`${config.scanIntervalHours} hours`)
          yield* scanOnce(config, 'schedule').pipe(
            Effect.tap((result) => Effect.logInfo(`scheduled scan: ${JSON.stringify(result)}`)),
            Effect.catch((error) => Effect.logWarning(`scheduled scan failed: ${String(error)}`)),
          )
        }
      }),
    )
  }

  yield* Effect.forkDetach(
    Effect.gen(function* () {
      const refreshed = yield* refreshSessionIfStale(
        config.cookieFile,
        config.authRefreshMinutes * 60_000,
      ).pipe(
        Effect.catch((error) =>
          Effect.logWarning(`auth boot refresh skipped: ${error.message}`).pipe(Effect.as(null)),
        ),
      )

      if (refreshed) {
        yield* Effect.logInfo(`auth boot refresh: region ${refreshed.region}; tokens refreshed`)
      }

      while (true) {
        yield* Effect.sleep(`${config.authRefreshMinutes} minutes`)
        yield* refreshSession(config.cookieFile).pipe(
          Effect.tap((session) =>
            Effect.logInfo(`auth refresh: region ${session.region}; tokens refreshed`),
          ),
          Effect.catch((error) => Effect.logWarning(`auth refresh failed: ${error.message}`)),
        )
      }
    }),
  )

  return yield* Effect.never
})

Effect.runPromise(main).catch((error: unknown) => {
  if (error instanceof RiotAuthError) {
    process.stderr.write(`${error.message}\n`)
  } else {
    process.stderr.write(`${String(error)}\n`)
  }

  process.exitCode = 1
})
