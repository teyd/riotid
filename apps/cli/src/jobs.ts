// @effect-diagnostics nodeBuiltinImport:off globalDate:off
import * as NodeHttpClient from '@effect/platform-node/NodeHttpClient'
import { AppConfig } from '@riotid/config'
import {
  backfillPlayerCards,
  backupDatabase,
  Database,
  migrateDatabase,
  migrationsFolder,
  pruneRuns,
  readDatabase,
  setMeta,
  writeDatabase,
} from '@riotid/db'
import { pruneMatchCache, resolveAnonymous } from '@riotid/identity'
import { scan, type ScanTrigger } from '@riotid/ingest'
import { refreshSession, RiotSourceLive, type AuthSession } from '@riotid/riot'
import { Clock, Effect, Layer } from 'effect'

export const withWrite = <A, E>(config: AppConfig, effect: Effect.Effect<A, E, Database>) =>
  effect.pipe(Effect.provide(writeDatabase(config.databasePath)))

export const withRead = <A, E>(config: AppConfig, effect: Effect.Effect<A, E, Database>) =>
  effect.pipe(Effect.provide(readDatabase(config.databasePath)))

const liveRiot = RiotSourceLive.pipe(Layer.provide(NodeHttpClient.layerNodeHttp))

const withRiot = (config: AppConfig) => Layer.mergeAll(writeDatabase(config.databasePath), liveRiot)

export const runMigrations = (config: AppConfig) =>
  Effect.gen(function* () {
    yield* withWrite(config, migrateDatabase(migrationsFolder))
    return yield* withWrite(config, backfillPlayerCards)
  })

export const runScan = (config: AppConfig, trigger: ScanTrigger) =>
  Effect.gen(function* () {
    yield* withWrite(config, migrateDatabase(migrationsFolder))
    const session = yield* refreshSession(config.cookieFile)
    return yield* scan({ session, trigger }).pipe(Effect.provide(withRiot(config)))
  })

export const runIdentity = (config: AppConfig, limit: number) =>
  Effect.gen(function* () {
    yield* withWrite(config, migrateDatabase(migrationsFolder))
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
      limit,
    }).pipe(Effect.provide(withRiot(config)))
    const pruned = yield* withWrite(
      config,
      pruneMatchCache({
        olderThanDays: config.matchCacheDays,
        matchesPerRegion: result.matchCap,
      }),
    )

    return { ...result, cachePruned: pruned.deleted }
  })

export const runBackup = (config: AppConfig) =>
  Effect.gen(function* () {
    const result = yield* backupDatabase({
      source: config.databasePath,
      directory: config.backupDirectory,
      keepDays: config.backupKeepDays,
    })
    const now = yield* Clock.currentTimeMillis
    yield* withWrite(config, setMeta('lastBackupAt', new Date(now).toISOString()))
    return result
  })

export const runPrune = (config: AppConfig) =>
  withWrite(config, pruneRuns({ olderThanDays: config.runRetentionDays }))

export const runAuthRefresh = (config: AppConfig): Effect.Effect<AuthSession, unknown> =>
  refreshSession(config.cookieFile)
