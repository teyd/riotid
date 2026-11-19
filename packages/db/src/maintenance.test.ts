// @effect-diagnostics nodeBuiltinImport:off
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

import { eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { Database, migrateDatabase, writeDatabase } from './client.ts'
import { backupDatabase, databaseStats, pruneRuns } from './maintenance.ts'
import { playerNames, runs } from './schema.ts'
import { seedDatabase } from './seed.ts'

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))

const withTempDirectory = async (
  prefix: string,
  run: (directory: string, path: string) => Promise<void>,
) => {
  const directory = await fs.mkdtemp(join(tmpdir(), prefix))
  const path = join(directory, 'test.db')

  try {
    await run(directory, path)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

const prepare = (path: string) =>
  Effect.gen(function* () {
    yield* migrateDatabase(migrationsFolder)
    yield* seedDatabase
  }).pipe(Effect.provide(writeDatabase(path)))

describe('maintenance', () => {
  it('backs up a consistent copy and prunes old snapshots', async () => {
    await withTempDirectory('riotid-maintenance-', async (directory, path) => {
      await Effect.runPromise(prepare(path))

      const backupDirectory = join(directory, 'backups')
      await fs.mkdir(backupDirectory)
      const stale = join(backupDirectory, 'riotid-stale.db')
      await fs.writeFile(stale, 'stale')
      const old = new Date(Date.now() - 30 * 86_400_000)
      await fs.utimes(stale, old, old)

      const result = await Effect.runPromise(
        backupDatabase({
          source: path,
          directory: backupDirectory,
          keepDays: 7,
        }),
      )

      expect(result.bytes).toBeGreaterThan(0)
      expect(result.pruned).toEqual([stale])
      await expect(fs.stat(stale)).rejects.toThrow()

      const copy = new DatabaseSync(result.path, { readOnly: true })
      try {
        const row = copy.prepare('select count(*) as total from players').get() as { total: number }
        expect(row.total).toBe(3)
        const integrity = copy.prepare('pragma integrity_check').get() as {
          integrity_check: string
        }
        expect(integrity.integrity_check).toBe('ok')
      } finally {
        copy.close()
      }
    })
  })

  it('prunes old runs and keeps interval history', async () => {
    await withTempDirectory('riotid-maintenance-', async (_directory, path) => {
      await Effect.runPromise(prepare(path))

      const program = Effect.gen(function* () {
        const db = yield* Database
        const old = new Date(Date.now() - 400 * 86_400_000)
        const inserted = yield* db
          .insert(runs)
          .values({
            status: 'succeeded',
            trigger: 'manual',
            clientVersion: 'old',
            startedAt: old,
            finishedAt: old,
            stats: {},
            updatedAt: old,
          })
          .returning({ id: runs.id })
        const runId = inserted[0]?.id
        if (!runId) throw new Error('missing run id')

        yield* db.insert(playerNames).values({
          puuid: 'seed-player-1',
          name: 'Old Name',
          tag: '0009',
          startedAt: old,
          endedAt: old,
          startedRunId: runId,
          endedRunId: runId,
          updatedAt: old,
        })

        const result = yield* pruneRuns({ olderThanDays: 180 })
        const remaining = yield* db.select().from(runs)
        const players = yield* db.select().from(playerNames).where(eq(playerNames.name, 'Old Name'))
        const current = yield* databaseStats

        return { result, remaining, players, current }
      }).pipe(Effect.provide(writeDatabase(path)))

      const { result, remaining, players, current } = await Effect.runPromise(program)

      expect(result.deleted).toBe(1)
      expect(remaining.map((row) => row.id)).toEqual([1])
      expect(players).toHaveLength(1)
      expect(players[0]?.startedRunId).toBeNull()
      expect(players[0]?.endedRunId).toBeNull()
      expect(current.runs).toBe(1)
    })
  })

  it('reports seeded statistics', async () => {
    await withTempDirectory('riotid-maintenance-', async (_directory, path) => {
      await Effect.runPromise(prepare(path))

      const stats = await Effect.runPromise(databaseStats.pipe(Effect.provide(writeDatabase(path))))

      expect(stats.players).toBe(3)
      expect(stats.nameIntervals).toBe(4)
      expect(stats.regionIntervals).toBe(3)
      expect(stats.banIntervals).toBe(1)
      expect(stats.openBans).toBe(1)
      expect(stats.anonymous).toBe(1)
      expect(stats.unresolvedAnonymous).toBe(1)
      expect(stats.linkedAnonymous).toBe(0)
      expect(stats.runs).toBe(1)
      expect(stats.latestRun?.id).toBe(1)
      expect(stats.latestRun?.status).toBe('succeeded')
      expect(Object.values(stats.byRegion).reduce((sum, value) => sum + value, 0)).toBe(3)
    })
  })
})
