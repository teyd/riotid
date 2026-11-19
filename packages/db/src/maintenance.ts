// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalDateInEffect:off
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'

import { and, count, desc, ne, sql } from 'drizzle-orm'
import { Data, Effect } from 'effect'

import { Database } from './client.ts'
import { players, runs } from './schema.ts'

export class MaintenanceError extends Data.TaggedError('MaintenanceError')<{
  readonly message: string
}> {}

export type BackupResult = {
  readonly path: string
  readonly bytes: number
  readonly pruned: ReadonlyArray<string>
}

const dayMs = 86_400_000

const pruneBackups = (
  directory: string,
  keepDays: number,
  now: Date,
): Effect.Effect<ReadonlyArray<string>, MaintenanceError> =>
  Effect.gen(function* () {
    const entries = yield* Effect.tryPromise({
      try: () => fs.readdir(directory),
      catch: (cause) =>
        new MaintenanceError({ message: `cannot list ${directory}: ${String(cause)}` }),
    })
    const backups: Array<{ path: string; modified: number }> = []

    for (const entry of entries.filter(
      (name) => name.startsWith('riotid-') && name.endsWith('.db'),
    )) {
      const path = join(directory, entry)
      const stat = yield* Effect.tryPromise({
        try: () => fs.stat(path),
        catch: (cause) =>
          new MaintenanceError({ message: `cannot stat ${path}: ${String(cause)}` }),
      })
      backups.push({ path, modified: stat.mtimeMs })
    }

    backups.sort((left, right) => right.modified - left.modified)
    const cutoff = now.getTime() - keepDays * dayMs

    return yield* Effect.forEach(
      backups.slice(1).filter((entry) => entry.modified < cutoff),
      (entry) =>
        Effect.tryPromise({
          try: async () => {
            await fs.rm(entry.path, { force: true })
            return entry.path
          },
          catch: (cause) =>
            new MaintenanceError({ message: `cannot remove ${entry.path}: ${String(cause)}` }),
        }),
      { concurrency: 1 },
    )
  })

export const backupDatabase = (options: {
  readonly source: string
  readonly directory: string
  readonly keepDays: number
  readonly now?: Date
}): Effect.Effect<BackupResult, MaintenanceError> =>
  Effect.gen(function* () {
    const now = options.now ?? new Date()
    const stamp = now.toISOString().replace(/[:.]/g, '-')
    const path = join(options.directory, `riotid-${stamp}.db`)

    yield* Effect.tryPromise({
      try: () => fs.mkdir(options.directory, { recursive: true }),
      catch: (cause) =>
        new MaintenanceError({ message: `cannot create ${options.directory}: ${String(cause)}` }),
    })

    yield* Effect.tryPromise({
      try: async () => {
        const source = new DatabaseSync(options.source)
        try {
          await backup(source, path)
        } finally {
          source.close()
        }
      },
      catch: (cause) => new MaintenanceError({ message: `backup failed: ${String(cause)}` }),
    })

    const stat = yield* Effect.tryPromise({
      try: () => fs.stat(path),
      catch: (cause) => new MaintenanceError({ message: `cannot stat ${path}: ${String(cause)}` }),
    })
    const pruned = yield* pruneBackups(options.directory, options.keepDays, now)

    return { path, bytes: stat.size, pruned }
  })

export type PruneResult = {
  readonly deleted: number
  readonly cutoff: string
}

export const pruneRuns = (options: {
  readonly olderThanDays: number
  readonly now?: Date
}): Effect.Effect<PruneResult, unknown, Database> =>
  Effect.gen(function* () {
    const db = yield* Database
    const now = options.now ?? new Date()
    const cutoff = new Date(now.getTime() - options.olderThanDays * dayMs)
    const deleted = yield* db
      .delete(runs)
      .where(and(ne(runs.status, 'running'), sql`${runs.startedAt} < ${cutoff.getTime()}`))
      .returning({ id: runs.id })

    return { deleted: deleted.length, cutoff: cutoff.toISOString() }
  })

export type DatabaseStats = {
  readonly players: number
  readonly nameIntervals: number
  readonly regionIntervals: number
  readonly banIntervals: number
  readonly openBans: number
  readonly anonymous: number
  readonly unresolvedAnonymous: number
  readonly linkedAnonymous: number
  readonly runs: number
  readonly latestRun: {
    readonly id: number
    readonly status: string
    readonly trigger: string
    readonly finishedAt: string | null
    readonly durationMs: number | null
  } | null
  readonly byRegion: Record<string, number>
}

export const databaseStats: Effect.Effect<DatabaseStats, unknown, Database> = Effect.gen(
  function* () {
    const db = yield* Database
    const totals = yield* db.get<{
      players: number
      nameIntervals: number
      regionIntervals: number
      banIntervals: number
      openBans: number
      anonymous: number
      unresolvedAnonymous: number
      linkedAnonymous: number
      runs: number
    }>(sql`
      select
        (select count(*) from players) as players,
        (select count(*) from player_names) as nameIntervals,
        (select count(*) from player_regions) as regionIntervals,
        (select count(*) from banned_players) as banIntervals,
        (select count(*) from banned_players where ended_at is null) as openBans,
        (select count(*) from anonymous_rows) as anonymous,
        (select count(*) from anonymous_rows where status = 'unresolved') as unresolvedAnonymous,
        (select count(*) from anonymous_rows where status = 'linked') as linkedAnonymous,
        (select count(*) from runs) as runs
    `)
    const latest = yield* db
      .select({
        id: runs.id,
        status: runs.status,
        trigger: runs.trigger,
        finishedAt: runs.finishedAt,
        durationMs: runs.durationMs,
      })
      .from(runs)
      .orderBy(desc(runs.id))
      .limit(1)
    const regions = yield* db
      .select({ region: players.region, total: count() })
      .from(players)
      .groupBy(players.region)

    return {
      players: totals?.players ?? 0,
      nameIntervals: totals?.nameIntervals ?? 0,
      regionIntervals: totals?.regionIntervals ?? 0,
      banIntervals: totals?.banIntervals ?? 0,
      openBans: totals?.openBans ?? 0,
      anonymous: totals?.anonymous ?? 0,
      unresolvedAnonymous: totals?.unresolvedAnonymous ?? 0,
      linkedAnonymous: totals?.linkedAnonymous ?? 0,
      runs: totals?.runs ?? 0,
      latestRun: latest[0]
        ? {
            id: latest[0].id,
            status: latest[0].status,
            trigger: latest[0].trigger,
            finishedAt: latest[0].finishedAt?.toISOString() ?? null,
            durationMs: latest[0].durationMs,
          }
        : null,
      byRegion: Object.fromEntries(regions.map((row) => [row.region ?? 'unknown', row.total])),
    }
  },
)
