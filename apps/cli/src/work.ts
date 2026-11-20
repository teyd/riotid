// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalDateInEffect:off
import { statSync } from 'node:fs'

import { AppConfig } from '@riotid/config'
import { databaseStats, readMeta, setMeta } from '@riotid/db'
import { CrawlerPausedError } from '@riotid/identity'
import { Cause, Clock, Effect } from 'effect'

import {
  runAuthRefresh,
  runBackup,
  runIdentity,
  runPrune,
  runScan,
  withRead,
  withWrite,
} from './jobs.ts'

export const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const maintenanceRetryMs = 10 * MINUTE_MS

export type WorkJob = 'scan' | 'maintenance' | 'identity' | 'auth'

export type Attempt = {
  readonly at: number
  readonly ok: boolean
}

export type IdentityAttempt = Attempt & {
  readonly tried: number
}

export type WorkState = {
  readonly now: number
  readonly bootedAt: number
  readonly scan: {
    readonly running: boolean
    readonly lastAttemptAt: number | null
  }
  readonly identity: {
    readonly last: IdentityAttempt | null
    readonly unresolved: number
    readonly budgetRemaining: number
  }
  readonly auth: {
    readonly lastSuccessAt: number | null
    readonly last: Attempt | null
  }
  readonly maintenance: {
    readonly lastSuccessAt: number | null
    readonly last: Attempt | null
  }
}

export type WorkConfig = {
  readonly scanIntervalHours: number
  readonly identityActiveMinutes: number
  readonly identityIdleMinutes: number
  readonly authRefreshMinutes: number
  readonly maintenanceDelayMinutes: number
  readonly maintenanceIntervalHours: number
}

export type WorkDecision = {
  readonly job: WorkJob | null
  readonly reason: string
}

export type WorkTickResult = WorkDecision & {
  readonly ok: boolean
}

export const nextBudgetResetAt = (now: number): number => {
  const date = new Date(now)
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 5)

  return today > now
    ? today
    : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 5)
}

const scanDueAt = (state: WorkState, config: WorkConfig): number =>
  state.scan.lastAttemptAt === null
    ? -Infinity
    : state.scan.lastAttemptAt + config.scanIntervalHours * HOUR_MS

const maintenanceDueAt = (state: WorkState, config: WorkConfig): number => {
  const base =
    state.maintenance.lastSuccessAt === null
      ? state.bootedAt + config.maintenanceDelayMinutes * MINUTE_MS
      : state.maintenance.lastSuccessAt + config.maintenanceIntervalHours * HOUR_MS
  const retry =
    state.maintenance.last && !state.maintenance.last.ok
      ? state.maintenance.last.at + maintenanceRetryMs
      : -Infinity

  return Math.max(base, retry)
}

const identityDueAt = (state: WorkState, config: WorkConfig): number => {
  if (state.identity.unresolved <= 0) return Infinity
  if (state.identity.budgetRemaining <= 0) return nextBudgetResetAt(state.now)

  const last = state.identity.last

  if (!last) return -Infinity
  if (!last.ok) return last.at + config.identityIdleMinutes * MINUTE_MS

  return (
    last.at +
    (last.tried > 0 ? config.identityActiveMinutes : config.identityIdleMinutes) * MINUTE_MS
  )
}

const authDueAt = (state: WorkState, config: WorkConfig): number => {
  const last = Math.max(state.auth.lastSuccessAt ?? -Infinity, state.auth.last?.at ?? -Infinity)

  return last === -Infinity ? -Infinity : last + config.authRefreshMinutes * MINUTE_MS
}

export const chooseJob = (state: WorkState, config: WorkConfig): WorkDecision => {
  if (state.scan.running) return { job: null, reason: 'scan running' }

  if (state.now >= scanDueAt(state, config)) {
    return {
      job: 'scan',
      reason: state.scan.lastAttemptAt === null ? 'no completed scan' : 'scan interval elapsed',
    }
  }

  if (state.now >= maintenanceDueAt(state, config)) {
    return {
      job: 'maintenance',
      reason:
        state.maintenance.lastSuccessAt === null
          ? 'boot maintenance due'
          : 'maintenance interval elapsed',
    }
  }

  if (state.now >= identityDueAt(state, config)) {
    if (state.identity.budgetRemaining <= 0) {
      return { job: 'identity', reason: 'daily Riot budget exhausted' }
    }

    return {
      job: 'identity',
      reason: state.identity.last ? 'identity interval elapsed' : 'identity pass due',
    }
  }

  if (state.now >= authDueAt(state, config)) {
    return { job: 'auth', reason: 'auth refresh due' }
  }

  return { job: null, reason: 'nothing due' }
}

const parseJson = <A>(raw: string | null): A | null => {
  if (!raw) return null

  try {
    return JSON.parse(raw) as A
  } catch {
    return null
  }
}

const utcDate = (now: number): string => new Date(now).toISOString().slice(0, 10)

const cookieMtime = (path: string): number | null => {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}

export const runWorkTick = (options: {
  readonly config: AppConfig
  readonly bootedAt: number
  readonly plan: boolean
}): Effect.Effect<WorkTickResult, unknown> =>
  Effect.gen(function* () {
    const { config, bootedAt, plan } = options
    const now = yield* Clock.currentTimeMillis

    const snapshot = yield* withRead(
      config,
      Effect.all({
        stats: databaseStats,
        identity: readMeta('work:identity').pipe(
          Effect.map((raw) => parseJson<IdentityAttempt>(raw)),
        ),
        auth: readMeta('work:auth').pipe(Effect.map((raw) => parseJson<Attempt>(raw))),
        maintenance: readMeta('work:maintenance').pipe(
          Effect.map((raw) => parseJson<Attempt>(raw)),
        ),
        lastBackupAt: readMeta('lastBackupAt'),
        usedToday: readMeta(`anon:requests:${utcDate(now)}`),
      }),
    )

    const latest = snapshot.stats.latestRun
    const lastAttemptAt = latest ? Date.parse(latest.finishedAt ?? latest.startedAt) : null
    const usedToday = Number(snapshot.usedToday ?? '0')
    const lastBackupAt = snapshot.lastBackupAt ? Date.parse(snapshot.lastBackupAt) : null

    const state: WorkState = {
      now,
      bootedAt,
      scan: {
        running: latest?.status === 'running',
        lastAttemptAt: Number.isFinite(lastAttemptAt) ? lastAttemptAt : null,
      },
      identity: {
        last: snapshot.identity,
        unresolved: snapshot.stats.unresolvedAnonymous,
        budgetRemaining: Math.max(
          0,
          config.anonBudget - (Number.isFinite(usedToday) ? usedToday : 0),
        ),
      },
      auth: {
        lastSuccessAt: cookieMtime(config.cookieFile),
        last: snapshot.auth,
      },
      maintenance: {
        lastSuccessAt: Number.isFinite(lastBackupAt) ? lastBackupAt : null,
        last: snapshot.maintenance,
      },
    }

    const decision = chooseJob(state, config)

    if (plan || decision.job === null) {
      return { ...decision, ok: true }
    }

    return yield* executeJob(decision.job, config).pipe(
      Effect.map((outcome) => ({ job: decision.job, ...outcome })),
    )
  })

const executeJob = (
  job: WorkJob,
  config: AppConfig,
): Effect.Effect<{ readonly ok: boolean; readonly reason: string }, unknown> =>
  Effect.gen(function* () {
    switch (job) {
      case 'scan':
        yield* runScan(config, 'schedule')
        return { ok: true, reason: 'scan complete' }
      case 'identity': {
        const result = yield* runIdentity(config, config.identityLimit)
        yield* record(job, config, { ok: true, tried: result.tried })
        return { ok: true, reason: `identity tried ${result.tried}` }
      }
      case 'maintenance': {
        const backup = yield* runBackup(config)
        const pruned = yield* runPrune(config)
        yield* record(job, config, { ok: true })
        return { ok: true, reason: `backup ${backup.bytes} bytes; pruned ${pruned.deleted} runs` }
      }
      case 'auth':
        yield* runAuthRefresh(config)
        yield* record(job, config, { ok: true })
        return { ok: true, reason: 'auth refreshed' }
    }
  }).pipe(
    Effect.catchCause((cause) => {
      const error = Cause.squash(cause)

      if (job === 'identity' && error instanceof CrawlerPausedError) {
        return Effect.succeed({ ok: true, reason: 'scan running; identity skipped' })
      }

      return Effect.logWarning(`${job} failed: ${String(error)}`).pipe(
        Effect.andThen(record(job, config, { ok: false })),
        Effect.as({ ok: false, reason: `${job} failed` }),
      )
    }),
  )

const record = (
  job: WorkJob,
  config: AppConfig,
  outcome: { readonly ok: boolean; readonly tried?: number },
) =>
  Effect.gen(function* () {
    if (job === 'scan') return

    const at = yield* Clock.currentTimeMillis
    const value =
      job === 'identity'
        ? { at, ok: outcome.ok, tried: outcome.tried ?? 0 }
        : { at, ok: outcome.ok }
    const key = `work:${job}`

    yield* withWrite(config, setMeta(key, JSON.stringify(value)))
  })
