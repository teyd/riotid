// @effect-diagnostics nodeBuiltinImport:off
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Config } from 'effect'

export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

const absolute = (value: string): string => (isAbsolute(value) ? value : resolve(repoRoot, value))
const int = (name: string, fallback: number) => Config.Int(name).pipe(Config.withDefault(fallback))
const bool = (name: string, fallback: boolean) =>
  Config.Boolean(name).pipe(Config.withDefault(fallback))
const text = (name: string, fallback: string) =>
  Config.String(name).pipe(Config.withDefault(fallback))
const number = (name: string, fallback: number) =>
  Config.Number(name).pipe(Config.withDefault(fallback))

export const AppConfig = Config.all({
  port: int('PORT', 8787),
  publicOrigin: text('PUBLIC_ORIGIN', 'http://localhost:5173'),
  cookieFile: text('COOKIE_FILE', './data/cookies.json'),
  databasePath: text('DATABASE_PATH', './data/riotid.db'),
  nodeEnv: text('NODE_ENV', 'development'),
  countryCode: text('RIOT_COUNTRY_CODE', 'US'),
  qrTimeoutSeconds: int('RIOT_QR_TIMEOUT_SECONDS', 300),
  authRefreshMinutes: int('AUTH_REFRESH_MINUTES', 45),
  scanIntervalHours: int('SCAN_INTERVAL_HOURS', 6),
  backupDirectory: text('BACKUP_DIRECTORY', './data/backups'),
  backupKeepDays: int('BACKUP_KEEP_DAYS', 7),
  runRetentionDays: int('RUN_RETENTION_DAYS', 180),
  indexRetentionDays: int('INDEX_RETENTION_DAYS', 30),
  indexPlayerLimit: int('INDEX_PLAYER_LIMIT', 50_000),
  anonBudget: int('ANON_RESOLVE_BUDGET', 5000),
  anonSeeds: int('ANON_SEEDS', 20),
  anonCoverageTarget: number('ANON_COVERAGE_TARGET', 0.9),
  matchCacheEnabled: bool('MATCH_CACHE_ENABLED', true),
  matchCacheMatchesPerRegion: int('MATCH_CACHE_MATCHES_PER_REGION', 1000),
  matchCacheMaxMatchesPerRegion: int('MATCH_CACHE_MAX_MATCHES_PER_REGION', 10_000),
  matchCacheAutotune: bool('MATCH_CACHE_AUTOTUNE', true),
  matchCacheDays: int('MATCH_CACHE_DAYS', 30),
  identityLimit: int('SCHEDULER_IDENTITY_LIMIT', 8),
  identityActiveMinutes: int('SCHEDULER_IDENTITY_ACTIVE_MINUTES', 15),
  identityIdleMinutes: int('SCHEDULER_IDENTITY_IDLE_MINUTES', 30),
  maintenanceDelayMinutes: int('SCHEDULER_MAINTENANCE_DELAY_MINUTES', 10),
  maintenanceIntervalHours: int('SCHEDULER_MAINTENANCE_INTERVAL_HOURS', 24),
  dryRun: bool('SCHEDULER_DRY_RUN', false),
  // Gates the scheduled job loops only; the scheduler still migrates and serves the API.
  jobsEnabled: bool('SCHEDULER_JOBS', true),
}).pipe(
  Config.map((config) => ({
    ...config,
    cookieFile: absolute(config.cookieFile),
    databasePath: absolute(config.databasePath),
    backupDirectory: absolute(config.backupDirectory),
  })),
)

export type AppConfig = Config.Success<typeof AppConfig>
