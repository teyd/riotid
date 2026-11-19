#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalDateInEffect:off globalJsonInEffect:off
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

import * as NodeHttpClient from '@effect/platform-node/NodeHttpClient'
import {
  anonymousRows,
  backupDatabase,
  checkDatabase,
  Database,
  databaseStats,
  meta,
  migrateDatabase,
  players,
  pruneRuns,
  readDatabase,
  seedDemoDatabase,
  writeDatabase,
} from '@riotid/db'
import {
  anonymousStats,
  matchCacheStats,
  pruneMatchCache,
  resolveAnonymous,
} from '@riotid/identity'
import { scan } from '@riotid/ingest'
import { serve } from '@hono/node-server'
import {
  loadCookieFile,
  parseCookieInput,
  qrLogin,
  reauth,
  refreshSession,
  refreshSessionIfStale,
  RiotAuthError,
  RiotSourceLive,
  saveCookieFile,
  type AuthSession,
} from '@riotid/riot'
import { sql } from 'drizzle-orm'
import { Clock, Config, Effect, Layer } from 'effect'

import { makeApp } from './app.ts'
import { runProbe } from './probe.ts'
import { loadPlayerDetail } from './site.ts'

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
  indexRetentionDays: Config.Int('INDEX_RETENTION_DAYS').pipe(Config.withDefault(30)),
  anonBudget: Config.Int('ANON_RESOLVE_BUDGET').pipe(Config.withDefault(1000)),
  anonSeeds: Config.Int('ANON_SEEDS').pipe(Config.withDefault(100)),
  anonCoverageTarget: Config.Number('ANON_COVERAGE_TARGET').pipe(Config.withDefault(0.9)),
  matchCacheEnabled: Config.Boolean('MATCH_CACHE_ENABLED').pipe(Config.withDefault(true)),
  matchCacheMatchesPerRegion: Config.Int('MATCH_CACHE_MATCHES_PER_REGION').pipe(
    Config.withDefault(1000),
  ),
  matchCacheMaxMatchesPerRegion: Config.Int('MATCH_CACHE_MAX_MATCHES_PER_REGION').pipe(
    Config.withDefault(10_000),
  ),
  matchCacheAutotune: Config.Boolean('MATCH_CACHE_AUTOTUNE').pipe(Config.withDefault(true)),
  matchCacheDays: Config.Int('MATCH_CACHE_DAYS').pipe(Config.withDefault(30)),
  adminToken: Config.String('ADMIN_TOKEN').pipe(Config.withDefault('')),
}).pipe(
  Config.map((config) => {
    const root = fileURLToPath(new URL('../../..', import.meta.url))
    const absolute = (value: string) => (isAbsolute(value) ? value : resolve(root, value))

    return {
      ...config,
      cookieFile: absolute(config.cookieFile),
      databasePath: absolute(config.databasePath),
      backupDirectory: absolute(config.backupDirectory),
    }
  }),
)

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
const logRun = <A, E, R>(label: string, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.tap((result) => Effect.logInfo(`${label}: ${JSON.stringify(result)}`)),
    Effect.catch((error) => Effect.logWarning(`${label} failed: ${String(error)}`)),
  )
const numericFlag = (name: string, fallback: number) => {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? Number(process.argv[index + 1]) : Number.NaN
  return Number.isFinite(value) ? value : fallback
}

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
  const result = yield* seedDemoDatabase.pipe(Effect.provide(writeDatabase(config.databasePath)))

  yield* Effect.logInfo(
    result.seeded
      ? `seeded demo data at ${config.databasePath} (run ${result.runId})`
      : 'demo seed already applied',
  )
})

const resetInterruptedRuns = Effect.gen(function* () {
  const config = yield* AppConfig
  const now = new Date()

  yield* Effect.gen(function* () {
    const db = yield* Database
    yield* db.run(sql`
      update runs
      set status = 'failed', error = 'container restarted', finished_at = ${now.getTime()}, updated_at = ${now.getTime()}
      where status = 'running'
    `)
  }).pipe(Effect.provide(writeDatabase(config.databasePath)))
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

const restoreCommand = Effect.gen(function* () {
  const config = yield* AppConfig
  const sourcePath = process.argv[3]

  if (!sourcePath) {
    process.stderr.write('usage: riotid backup:restore <file> --yes\n')
    process.exitCode = 2
    return
  }

  if (!existsSync(sourcePath)) {
    process.stderr.write(`backup not found: ${sourcePath}\n`)
    process.exitCode = 1
    return
  }

  if (!process.argv.includes('--yes')) {
    process.stderr.write('refusing to replace the database without --yes\n')
    process.exitCode = 1
    return
  }

  const check = new DatabaseSync(sourcePath, { readOnly: true })
  try {
    const integrity = check.prepare('pragma integrity_check').get() as {
      integrity_check: string
    }
    if (integrity.integrity_check !== 'ok') {
      process.stderr.write(`backup failed integrity check: ${integrity.integrity_check}\n`)
      process.exitCode = 1
      return
    }
  } finally {
    check.close()
  }

  const temporary = `${config.databasePath}.restore`
  copyFileSync(sourcePath, temporary)
  copyFileSync(temporary, config.databasePath)
  rmSync(temporary, { force: true })
  rmSync(`${config.databasePath}-wal`, { force: true })
  rmSync(`${config.databasePath}-shm`, { force: true })
  const now = new Date()
  yield* bumpIndex(now).pipe(Effect.provide(writeDatabase(config.databasePath)))

  yield* Effect.logInfo(`restored ${config.databasePath} from ${sourcePath}; restart the API`)
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

const resolvePass = (config: {
  cookieFile: string
  databasePath: string
  anonBudget: number
  anonSeeds: number
  anonCoverageTarget: number
  matchCacheEnabled: boolean
  matchCacheMatchesPerRegion: number
  matchCacheMaxMatchesPerRegion: number
  matchCacheAutotune: boolean
  matchCacheDays: number
  limit: number
}) =>
  Effect.gen(function* () {
    const session = yield* refreshSession(config.cookieFile)
    const result = yield* resolveAnonymous({
      session,
      budget: config.anonBudget,
      seeds: config.anonSeeds,
      coverageTarget: config.anonCoverageTarget,
      cacheEnabled: config.matchCacheEnabled,
      cacheMatchesPerRegion: config.matchCacheMatchesPerRegion,
      cacheMaxMatchesPerRegion: config.matchCacheMaxMatchesPerRegion,
      autotune: config.matchCacheAutotune,
      limit: config.limit,
    })
    const pruned = yield* pruneMatchCache({
      olderThanDays: config.matchCacheDays,
      matchesPerRegion: result.matchCap,
    })

    return { ...result, cachePruned: pruned.deleted }
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        writeDatabase(config.databasePath),
        RiotSourceLive.pipe(Layer.provide(NodeHttpClient.layerNodeHttp)),
      ),
    ),
  )

const scanNow = (config: Parameters<typeof scanOnce>[0]) =>
  Effect.runPromise(scanOnce(config, 'manual'))

const resolveNow = (config: Parameters<typeof resolvePass>[0]) =>
  Effect.runPromise(resolvePass(config))

const anonResolve = Effect.gen(function* () {
  const config = yield* AppConfig

  yield* migrateDatabase(migrationsFolder).pipe(Effect.provide(writeDatabase(config.databasePath)))
  const result = yield* resolvePass({ ...config, limit: numericFlag('--limit', 500) })

  if (jsonOutput) {
    printJson(result)
  } else {
    yield* Effect.logInfo(`identity resolve: ${JSON.stringify(result)}`)
  }
})

const anonList = Effect.gen(function* () {
  const config = yield* AppConfig
  const [anonymous, cache] = yield* Effect.all([
    anonymousStats.pipe(Effect.provide(readDatabase(config.databasePath))),
    matchCacheStats.pipe(Effect.provide(readDatabase(config.databasePath))),
  ])

  if (jsonOutput) {
    printJson({ anonymous, cache })
    return
  }

  yield* Effect.logInfo(
    `anonymous: ${anonymous.total} rows · ${anonymous.unresolved} unresolved · ${anonymous.linked} linked`,
  )

  for (const [region, counts] of Object.entries(anonymous.byRegion)) {
    yield* Effect.logInfo(
      `  ${region}: ${counts.unresolved} unresolved · ${counts.linked} linked · ${counts.ignored} ignored`,
    )
  }

  yield* Effect.logInfo(`match cache: ${cache.matches} matches · ${cache.rows} participant rows`)
})

const anonCache = Effect.gen(function* () {
  const config = yield* AppConfig
  const cache = yield* matchCacheStats.pipe(Effect.provide(readDatabase(config.databasePath)))

  if (process.argv.includes('--prune')) {
    const pruned = yield* pruneMatchCache({
      olderThanDays: config.matchCacheDays,
      matchesPerRegion: config.matchCacheMatchesPerRegion,
    }).pipe(Effect.provide(writeDatabase(config.databasePath)))

    if (jsonOutput) {
      printJson({ cache, pruned })
    } else {
      yield* Effect.logInfo(`match cache pruned: ${pruned.deleted} rows`)
    }
    return
  }

  if (jsonOutput) {
    printJson(cache)
  } else {
    yield* Effect.logInfo(JSON.stringify(cache, null, 2))
  }
})

const bumpIndex = (now: Date) =>
  Effect.gen(function* () {
    const db = yield* Database
    yield* db
      .insert(meta)
      .values({ key: 'indexVersion', value: '1', updatedAt: now })
      .onConflictDoUpdate({
        target: meta.key,
        set: { value: sql`cast(${meta.value} as integer) + 1`, updatedAt: now },
      })
  })

const indexRebuild = Effect.gen(function* () {
  const config = yield* AppConfig
  const now = new Date()

  yield* bumpIndex(now).pipe(Effect.provide(writeDatabase(config.databasePath)))
  yield* Effect.logInfo('index version bumped; API will rebuild on the next request')
})

const playerShow = Effect.gen(function* () {
  const config = yield* AppConfig
  const puuid = process.argv[3]

  if (!puuid) {
    process.stderr.write('usage: riotid player:show <puuid>\n')
    process.exitCode = 2
    return
  }

  const detail = yield* loadPlayerDetail(puuid).pipe(
    Effect.provide(readDatabase(config.databasePath)),
  )

  if (!detail) {
    process.stderr.write(`player not found: ${puuid}\n`)
    process.exitCode = 1
    return
  }

  if (jsonOutput) {
    printJson(detail)
  } else {
    yield* Effect.logInfo(JSON.stringify(detail, null, 2))
  }
})

const playerRemove = Effect.gen(function* () {
  const config = yield* AppConfig
  const puuid = process.argv[3]

  if (!puuid) {
    process.stderr.write('usage: riotid player:remove <puuid> --yes\n')
    process.exitCode = 2
    return
  }

  if (!process.argv.includes('--yes')) {
    process.stderr.write(`refusing to redact ${puuid} without --yes\n`)
    process.exitCode = 1
    return
  }

  const now = new Date()
  const removed = yield* Effect.gen(function* () {
    const db = yield* Database
    return yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx
          .update(anonymousRows)
          .set({ status: 'ignored', resolvedPuuid: null, updatedAt: now })
          .where(sql`${anonymousRows.resolvedPuuid} = ${puuid}`)
        const deleted = yield* tx
          .delete(players)
          .where(sql`${players.puuid} = ${puuid}`)
          .returning({ puuid: players.puuid })
        return deleted.length
      }),
    )
  }).pipe(Effect.provide(writeDatabase(config.databasePath)))

  yield* bumpIndex(now).pipe(Effect.provide(writeDatabase(config.databasePath)))

  if (jsonOutput) {
    printJson({ puuid, removed: removed > 0 })
  } else {
    yield* Effect.logInfo(removed > 0 ? `redacted ${puuid}` : `player not found: ${puuid}`)
  }

  if (removed === 0) {
    process.exitCode = 1
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

  if (command === 'anon:list') {
    yield* anonList
    return
  }

  if (command === 'anon:resolve') {
    yield* anonResolve
    return
  }

  if (command === 'anon:cache') {
    yield* anonCache
    return
  }

  if (command === 'index:rebuild') {
    yield* indexRebuild
    return
  }

  if (command === 'player:show') {
    yield* playerShow
    return
  }

  if (command === 'player:remove') {
    yield* playerRemove
    return
  }

  if (command === 'db:prune') {
    yield* pruneCommand
    return
  }

  if (command === 'backup:restore') {
    yield* restoreCommand
    return
  }

  if (command !== 'serve') {
    process.stderr.write(`Unknown command: ${command}\n\n${help}`)
    process.exitCode = 2
    return
  }

  const config = yield* AppConfig

  yield* migrateDatabase(migrationsFolder).pipe(Effect.provide(writeDatabase(config.databasePath)))

  if (config.nodeEnv !== 'production') {
    const count = yield* Effect.gen(function* () {
      const db = yield* Database
      return yield* db.get<{ n: number }>(sql`select count(*) as n from players`)
    }).pipe(Effect.provide(writeDatabase(config.databasePath)))

    if ((count?.n ?? 0) === 0) {
      const seeded = yield* seedDemoDatabase.pipe(
        Effect.provide(writeDatabase(config.databasePath)),
      )
      if (seeded.seeded) {
        yield* Effect.logInfo('seeded demo development data')
      }
    }
  }

  if (config.nodeEnv === 'production') {
    yield* resetInterruptedRuns
  }

  const adminToken = config.adminToken
  const app = makeApp({
    databasePath: config.databasePath,
    cookieFile: config.cookieFile,
    indexWindowDays: config.indexRetentionDays,
    ...(adminToken
      ? {
          admin: {
            token: adminToken,
            scan: () => scanNow(config),
            resolve: () => resolveNow({ ...config, limit: 500 }),
          },
        }
      : {}),
  })

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
          yield* logRun('boot scan', scanOnce(config, 'boot'))
        }

        while (true) {
          yield* Effect.sleep(`${config.scanIntervalHours} hours`)
          yield* logRun('scheduled scan', scanOnce(config, 'schedule'))
        }
      }),
    )

    yield* Effect.forkDetach(
      Effect.gen(function* () {
        const lastRun = yield* Effect.gen(function* () {
          const db = yield* Database
          return yield* db.get<{ value: string }>(
            `select value from meta where key = 'anon:lastRunAt'`,
          )
        }).pipe(Effect.provide(writeDatabase(config.databasePath)))
        const lastRunAt = lastRun ? Date.parse(lastRun.value) : 0
        const now = yield* Clock.currentTimeMillis

        if (now - lastRunAt >= 86_400_000) {
          yield* logRun('identity boot pass', resolvePass({ ...config, limit: 500 }))
        }

        while (true) {
          yield* Effect.sleep('24 hours')
          yield* logRun('identity daily pass', resolvePass({ ...config, limit: 500 }))
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
