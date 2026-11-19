#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalDateInEffect:off globalJsonInEffect:off
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { parseArgs } from 'node:util'

import * as NodeHttpClient from '@effect/platform-node/NodeHttpClient'
import { AppConfig } from '@riotid/config'
import {
  anonymousRows,
  backfillPlayerCards,
  backupDatabase,
  bumpIndexVersion,
  checkDatabase,
  Database,
  databaseStats,
  loadPlayerDetail,
  migrateDatabase,
  migrationsFolder,
  players,
  pruneRuns,
  readDatabase,
  recoverInterruptedRuns,
  seedDemoDatabase,
  setMeta,
  writeDatabase,
} from '@riotid/db'
import {
  anonymousStats,
  matchCacheStats,
  pruneMatchCache,
  resolveAnonymous,
} from '@riotid/identity'
import { scan } from '@riotid/ingest'
import {
  loadCookieFile,
  parseCookieInput,
  qrLogin,
  reauth,
  refreshSession,
  RiotAuthError,
  RiotSourceLive,
  saveCookieFile,
  type AuthSession,
} from '@riotid/riot'
import { sql } from 'drizzle-orm'
import { Cause, Clock, Data, Effect, Layer, Logger } from 'effect'

import { runProbe } from './probe.ts'

const require = createRequire(import.meta.url)
const qrcode = require('qrcode-terminal') as {
  generate: (input: string, options: { small: boolean }, callback: (code: string) => void) => void
}

class CliError extends Data.TaggedError('CliError')<{
  readonly message: string
  readonly exitCode: number
}> {}

const usageError = (message: string) => new CliError({ message, exitCode: 2 })
const failure = (message: string) => new CliError({ message, exitCode: 1 })

type Flags = {
  readonly json: boolean
  readonly yes: boolean
  readonly prune: boolean
  readonly limit: number | undefined
}

type CommandContext = {
  readonly config: AppConfig
  readonly flags: Flags
  readonly positionals: ReadonlyArray<string>
}

type Command = {
  readonly summary: string
  readonly run: (context: CommandContext) => Effect.Effect<unknown, unknown>
}

const printJson = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`)

const renderQr = (url: string) =>
  Effect.sync(() => {
    process.stdout.write(`\nScan with the Riot Mobile app:\n${url}\n\n`)
    qrcode.generate(url, { small: true }, (code) => process.stdout.write(`${code}\n`))
  })

const sessionInfo = (session: AuthSession, cookieFile: string) => ({
  puuid: session.puuid,
  region: session.region,
  expiresAt: new Date(session.expiresAt).toISOString(),
  cookieFile,
})

const logSession = (session: AuthSession, cookieFile: string) =>
  Effect.logInfo(
    `Authenticated ${session.puuid} · region ${session.region} · token expires ${new Date(
      session.expiresAt,
    ).toISOString()} · jar ${cookieFile}`,
  )

const withWrite = <A, E>(config: AppConfig, effect: Effect.Effect<A, E, Database>) =>
  effect.pipe(Effect.provide(writeDatabase(config.databasePath)))

const withRead = <A, E>(config: AppConfig, effect: Effect.Effect<A, E, Database>) =>
  effect.pipe(Effect.provide(readDatabase(config.databasePath)))

const liveRiot = RiotSourceLive.pipe(Layer.provide(NodeHttpClient.layerNodeHttp))

const withRiot = (config: AppConfig) => Layer.mergeAll(writeDatabase(config.databasePath), liveRiot)

const migrate = (config: AppConfig) =>
  Effect.gen(function* () {
    yield* withWrite(config, migrateDatabase(migrationsFolder))
    return yield* withWrite(config, backfillPlayerCards)
  })

const authLogin: Command = {
  summary: 'Sign in with a Riot Mobile QR code',
  run: ({ config, flags }) =>
    Effect.gen(function* () {
      const cookies = yield* qrLogin({
        countryCode: config.countryCode,
        timeoutSeconds: config.qrTimeoutSeconds,
        onUrl: (url) =>
          flags.json
            ? Effect.sync(() => {
                process.stderr.write(`Scan with the Riot Mobile app: ${url}\n`)
              })
            : renderQr(url),
      })
      const session = yield* reauth(cookies)

      yield* saveCookieFile(config.cookieFile, session.cookies, 'qr')
      if (!flags.json) yield* logSession(session, config.cookieFile)
      return sessionInfo(session, config.cookieFile)
    }),
}

const authSave: Command = {
  summary: 'Import a pasted cookie jar (or read stdin)',
  run: ({ config, flags, positionals }) =>
    Effect.gen(function* () {
      const sourcePath = positionals[0]
      const input = sourcePath ? readFileSync(sourcePath, 'utf8') : readFileSync(0, 'utf8')
      const cookies = parseCookieInput(input)

      if (Object.keys(cookies).length === 0) {
        return yield* failure('No cookies were found in the input.')
      }

      const session = yield* reauth(cookies)

      yield* saveCookieFile(config.cookieFile, session.cookies, 'paste')
      if (!flags.json) yield* logSession(session, config.cookieFile)
      return sessionInfo(session, config.cookieFile)
    }),
}

const authCheck: Command = {
  summary: 'Verify the stored cookie jar and persist refreshed tokens',
  run: ({ config, flags }) =>
    Effect.gen(function* () {
      const session = yield* refreshSession(config.cookieFile)

      if (!flags.json) yield* logSession(session, config.cookieFile)
      return sessionInfo(session, config.cookieFile)
    }),
}

const probe: Command = {
  summary: 'Probe live leaderboard/name/match endpoints',
  run: ({ config }) =>
    runProbe(config.cookieFile).pipe(Effect.provide(NodeHttpClient.layerNodeHttp)),
}

const dbMigrate: Command = {
  summary: 'Apply committed database migrations',
  run: (context) =>
    Effect.gen(function* () {
      const cardsBackfilled = yield* migrate(context.config)
      yield* Effect.logInfo(`database migrated at ${context.config.databasePath}`)
      return { database: context.config.databasePath, migrated: true, cardsBackfilled }
    }),
}

const dbSeed: Command = {
  summary: 'Seed synthetic development data',
  run: ({ config }) =>
    Effect.gen(function* () {
      if (config.nodeEnv === 'production') {
        return yield* failure('refusing to seed a production database')
      }

      yield* migrate(config)
      const result = yield* withWrite(config, seedDemoDatabase)

      yield* Effect.logInfo(
        result.seeded
          ? `seeded demo data at ${config.databasePath} (run ${result.runId})`
          : 'demo seed already applied',
      )
      return result
    }),
}

const dbCheck: Command = {
  summary: 'Check database invariants',
  run: ({ config, flags }) =>
    Effect.gen(function* () {
      const report = yield* withRead(config, checkDatabase)

      if (!flags.json) {
        yield* Effect.logInfo(`database check: ${report.ok ? 'ok' : 'failed'}`)
        yield* Effect.logInfo(`integrity: ${report.integrity}`)

        for (const issue of report.issues) {
          yield* Effect.logWarning(issue)
        }
      }

      if (!report.ok) process.exitCode = 1
      return report
    }),
}

const dbRecover: Command = {
  summary: 'Mark interrupted runs as failed after a restart',
  run: ({ config }) =>
    Effect.gen(function* () {
      const result = yield* withWrite(config, recoverInterruptedRuns)
      yield* Effect.logInfo(`recovered ${result.reset} interrupted runs`)
      return result
    }),
}

const dbPrune: Command = {
  summary: 'Delete runs older than RUN_RETENTION_DAYS',
  run: ({ config, flags }) =>
    Effect.gen(function* () {
      const result = yield* withWrite(config, pruneRuns({ olderThanDays: config.runRetentionDays }))

      if (!flags.json) {
        yield* Effect.logInfo(`pruned ${result.deleted} runs older than ${result.cutoff}`)
      }
      return result
    }),
}

const scanCommand: Command = {
  summary: 'Run one leaderboard scan',
  run: ({ config, flags }) =>
    Effect.gen(function* () {
      yield* withWrite(config, migrateDatabase(migrationsFolder))
      const session = yield* refreshSession(config.cookieFile)
      const result = yield* scan({ session, trigger: 'manual' }).pipe(
        Effect.provide(withRiot(config)),
      )

      if (!flags.json) yield* Effect.logInfo(`scan complete: ${JSON.stringify(result)}`)
      return result
    }),
}

const stats: Command = {
  summary: 'Show database totals',
  run: ({ config, flags }) =>
    Effect.gen(function* () {
      const result = yield* withRead(config, databaseStats)

      if (!flags.json) yield* Effect.logInfo(JSON.stringify(result, null, 2))
      return result
    }),
}

const backup: Command = {
  summary: 'Back up the database and prune old backups',
  run: ({ config, flags }) =>
    Effect.gen(function* () {
      const result = yield* backupDatabase({
        source: config.databasePath,
        directory: config.backupDirectory,
        keepDays: config.backupKeepDays,
      })
      const now = yield* Clock.currentTimeMillis

      yield* withWrite(config, setMeta('lastBackupAt', new Date(now).toISOString()))

      if (!flags.json) {
        yield* Effect.logInfo(
          `backup: ${result.path} (${result.bytes} bytes, pruned ${result.pruned.length})`,
        )
      }
      return result
    }),
}

const backupRestore: Command = {
  summary: 'Replace the database from a backup file',
  run: ({ config, flags, positionals }) =>
    Effect.gen(function* () {
      const sourcePath = positionals[0]

      if (!sourcePath) return yield* usageError('usage: riotid backup:restore <file> --yes')

      if (!existsSync(sourcePath)) return yield* failure(`backup not found: ${sourcePath}`)

      if (!flags.yes) {
        return yield* failure('refusing to replace the database without --yes')
      }

      const check = new DatabaseSync(sourcePath, { readOnly: true })
      try {
        const integrity = check.prepare('pragma integrity_check').get() as {
          integrity_check: string
        }
        if (integrity.integrity_check !== 'ok') {
          return yield* failure(`backup failed integrity check: ${integrity.integrity_check}`)
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
      yield* withWrite(config, bumpIndexVersion)

      yield* Effect.logInfo(`restored ${config.databasePath} from ${sourcePath}; restart the API`)
      return { restored: true, database: config.databasePath, source: sourcePath }
    }),
}

const anonList: Command = {
  summary: 'List anonymous rows and match-cache totals',
  run: ({ config, flags }) =>
    Effect.gen(function* () {
      const [anonymous, cache] = yield* Effect.all([
        withRead(config, anonymousStats),
        withRead(config, matchCacheStats),
      ])

      if (!flags.json) {
        yield* Effect.logInfo(
          `anonymous: ${anonymous.total} rows · ${anonymous.unresolved} unresolved · ${anonymous.linked} linked`,
        )

        for (const [region, counts] of Object.entries(anonymous.byRegion)) {
          yield* Effect.logInfo(
            `  ${region}: ${counts.unresolved} unresolved · ${counts.linked} linked · ${counts.ignored} ignored`,
          )
        }

        yield* Effect.logInfo(
          `match cache: ${cache.matches} matches · ${cache.rows} participant rows`,
        )
      }

      return { anonymous, cache }
    }),
}

const anonResolve: Command = {
  summary: 'Resolve anonymous leaderboard rows through the match graph',
  run: ({ config, flags }) =>
    Effect.gen(function* () {
      yield* withWrite(config, migrateDatabase(migrationsFolder))
      const session = yield* refreshSession(config.cookieFile)
      const limit = flags.limit ?? 500
      const result = yield* resolveAnonymous({
        session,
        budget: config.anonBudget,
        seeds: config.anonSeeds,
        coverageTarget: config.anonCoverageTarget,
        cacheEnabled: config.matchCacheEnabled,
        cacheMatchesPerRegion: config.matchCacheMatchesPerRegion,
        cacheMaxMatchesPerRegion: config.matchCacheMaxMatchesPerRegion,
        autotune: config.matchCacheAutotune,
        limit,
      }).pipe(Effect.provide(withRiot(config)))
      const pruned = yield* withWrite(
        config,
        pruneMatchCache({
          olderThanDays: config.matchCacheDays,
          matchesPerRegion: result.matchCap,
        }),
      )

      const payload = { ...result, cachePruned: pruned.deleted }

      if (!flags.json) yield* Effect.logInfo(`identity resolve: ${JSON.stringify(payload)}`)
      return payload
    }),
}

const anonCache: Command = {
  summary: 'Inspect or prune the match cache',
  run: ({ config, flags }) =>
    Effect.gen(function* () {
      const cache = yield* withRead(config, matchCacheStats)

      if (!flags.prune) {
        if (!flags.json) yield* Effect.logInfo(JSON.stringify(cache, null, 2))
        return cache
      }

      const pruned = yield* withWrite(
        config,
        pruneMatchCache({
          olderThanDays: config.matchCacheDays,
          matchesPerRegion: config.matchCacheMatchesPerRegion,
        }),
      )

      if (!flags.json) yield* Effect.logInfo(`match cache pruned: ${pruned.deleted} rows`)
      return { cache, pruned }
    }),
}

const indexRebuild: Command = {
  summary: 'Bump the index version so the API rebuilds on the next request',
  run: ({ config }) =>
    Effect.gen(function* () {
      yield* withWrite(config, bumpIndexVersion)
      yield* Effect.logInfo('index version bumped; API will rebuild on the next request')
      return { rebuilt: true }
    }),
}

const playerShow: Command = {
  summary: 'Print a player timeline by puuid',
  run: ({ config, flags, positionals }) =>
    Effect.gen(function* () {
      const puuid = positionals[0]

      if (!puuid) return yield* usageError('usage: riotid player:show <puuid>')

      const detail = yield* withRead(config, loadPlayerDetail(puuid))

      if (!detail) return yield* failure(`player not found: ${puuid}`)

      if (!flags.json) yield* Effect.logInfo(JSON.stringify(detail, null, 2))
      return detail
    }),
}

const playerRemove: Command = {
  summary: 'Redact a player and unlink its anonymous rows',
  run: ({ config, flags, positionals }) =>
    Effect.gen(function* () {
      const puuid = positionals[0]

      if (!puuid) return yield* usageError('usage: riotid player:remove <puuid> --yes')

      if (!flags.yes) return yield* failure(`refusing to redact ${puuid} without --yes`)

      const now = new Date()
      const removed = yield* withWrite(
        config,
        Effect.gen(function* () {
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
        }),
      )

      yield* withWrite(config, bumpIndexVersion)

      if (!flags.json) {
        yield* Effect.logInfo(removed > 0 ? `redacted ${puuid}` : `player not found: ${puuid}`)
      }

      if (removed === 0) process.exitCode = 1
      return { puuid, removed: removed > 0 }
    }),
}

const status: Command = {
  summary: 'Show readiness, auth, and database state',
  run: ({ config, flags }) =>
    Effect.gen(function* () {
      const file = yield* loadCookieFile(config.cookieFile)
      const stats = yield* withRead(config, databaseStats).pipe(
        Effect.catchCause(() => Effect.succeed(null)),
      )
      const payload = {
        port: config.port,
        database: config.databasePath,
        cookieFile: config.cookieFile,
        cookieSource: file?.source ?? null,
        cookieUpdatedAt: file?.updatedAt ?? null,
        stats,
      }

      if (!flags.json) {
        yield* Effect.logInfo(`riotid ready on port ${config.port}`)
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
      }

      return payload
    }),
}

const commands: Record<string, Command> = {
  'auth:login': authLogin,
  'auth:save': authSave,
  'auth:check': authCheck,
  'auth:refresh': authCheck,
  probe,
  'db:migrate': dbMigrate,
  'db:seed': dbSeed,
  'db:check': dbCheck,
  'db:recover': dbRecover,
  'db:prune': dbPrune,
  scan: scanCommand,
  stats,
  backup,
  'backup:restore': backupRestore,
  'anon:list': anonList,
  'anon:resolve': anonResolve,
  'anon:cache': anonCache,
  'index:rebuild': indexRebuild,
  'player:show': playerShow,
  'player:remove': playerRemove,
  status,
}

const help = () => {
  const width = Math.max(...Object.keys(commands).map((name) => name.length), 'help'.length)
  const entries = [
    ...Object.entries(commands).map(
      ([name, command]) => `  ${name.padEnd(width)}  ${command.summary}`,
    ),
    `  ${'help'.padEnd(width)}  Show this help`,
  ]

  return `riotid

Usage:
  riotid <command> [arguments] [options]
  riotid help

Commands:
${entries.join('\n')}

Options:
  --json           Print exactly one JSON value to stdout; logs go to stderr
  --yes            Confirm destructive operations
  --prune          Prune the match cache (anon:cache)
  --limit <n>      Cap the anonymous resolve batch (anon:resolve)
`
}

const parseInvocation = (argv: ReadonlyArray<string>) => {
  const parsed = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: false,
    options: {
      json: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
      prune: { type: 'boolean', default: false },
      limit: { type: 'string' },
    },
  })
  const rawLimit = parsed.values.limit
  const limit = typeof rawLimit === 'string' ? Number(rawLimit) : Number.NaN

  return {
    command: parsed.positionals[0] ?? 'help',
    positionals: parsed.positionals.slice(1),
    flags: {
      json: parsed.values.json === true,
      yes: parsed.values.yes === true,
      prune: parsed.values.prune === true,
      limit: Number.isFinite(limit) ? limit : undefined,
    } satisfies Flags,
  }
}

const run = (argv: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const invocation = parseInvocation(argv)

    if (invocation.command === 'help' || invocation.command === '--help') {
      process.stdout.write(help())
      return 0
    }

    const command = commands[invocation.command]

    if (!command) {
      return yield* new CliError({
        message: `Unknown command: ${invocation.command}\n\n${help()}`,
        exitCode: 2,
      })
    }

    const config = yield* AppConfig
    const value = yield* command.run({
      config,
      flags: invocation.flags,
      positionals: invocation.positionals,
    })

    if (invocation.flags.json) printJson(value)
    return process.exitCode ?? 0
  }).pipe(
    Effect.catchCause((cause) => {
      const error = Cause.squash(cause)

      return Effect.sync(() => {
        if (error instanceof CliError) {
          process.stderr.write(`${error.message}\n`)
          return error.exitCode
        }

        if (error instanceof RiotAuthError) {
          process.stderr.write(`${error.message}\n`)
          return 1
        }

        process.stderr.write(`${String(error)}\n`)
        return 1
      })
    }),
  )

const argv = process.argv.slice(2)
const json = argv.includes('--json')
const program = json ? run(argv).pipe(Effect.provideService(Logger.LogToStderr, true)) : run(argv)

Effect.runPromise(program).then(
  (code) => {
    process.exitCode = code
  },
  (error: unknown) => {
    process.stderr.write(`${String(error)}\n`)
    process.exitCode = 1
  },
)
