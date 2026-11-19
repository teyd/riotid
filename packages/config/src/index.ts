// @effect-diagnostics nodeBuiltinImport:off
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Config } from 'effect'

export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

const absolute = (value: string): string => (isAbsolute(value) ? value : resolve(repoRoot, value))

export const AppConfig = Config.all({
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
  anonBudget: Config.Int('ANON_RESOLVE_BUDGET').pipe(Config.withDefault(5000)),
  anonSeeds: Config.Int('ANON_SEEDS').pipe(Config.withDefault(20)),
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
  identityLimit: Config.Int('SCHEDULER_IDENTITY_LIMIT').pipe(Config.withDefault(8)),
  identityActiveMinutes: Config.Int('SCHEDULER_IDENTITY_ACTIVE_MINUTES').pipe(
    Config.withDefault(15),
  ),
  identityIdleMinutes: Config.Int('SCHEDULER_IDENTITY_IDLE_MINUTES').pipe(Config.withDefault(30)),
  maintenanceDelayMinutes: Config.Int('SCHEDULER_MAINTENANCE_DELAY_MINUTES').pipe(
    Config.withDefault(10),
  ),
  maintenanceIntervalHours: Config.Int('SCHEDULER_MAINTENANCE_INTERVAL_HOURS').pipe(
    Config.withDefault(24),
  ),
  dryRun: Config.Boolean('SCHEDULER_DRY_RUN').pipe(Config.withDefault(false)),
  // Gates the scheduled job loops only; the scheduler still migrates and serves the API.
  jobsEnabled: Config.Boolean('SCHEDULER_JOBS').pipe(Config.withDefault(true)),
}).pipe(
  Config.map((config) => ({
    ...config,
    cookieFile: absolute(config.cookieFile),
    databasePath: absolute(config.databasePath),
    backupDirectory: absolute(config.backupDirectory),
  })),
)

export type AppConfig = Config.Success<typeof AppConfig>
