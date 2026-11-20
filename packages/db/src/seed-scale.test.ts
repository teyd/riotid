import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { PlayerPage } from '@riotid/contracts'
import { sql } from 'drizzle-orm'
import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { checkDatabase } from './check.ts'
import { Database, migrateDatabase, writeDatabase } from './client.ts'
import { databaseStats } from './maintenance.ts'
import { migrationsFolder } from './paths.ts'
import { decodePlayerCursor, listPlayersPage, searchPlayers } from './read-model.ts'
import { seedScaleDatabase } from './seed-scale.ts'

const withDatabase = async (prefix: string, run: (path: string) => Promise<void>) => {
  const directory = await fs.mkdtemp(join(tmpdir(), prefix))
  const path = join(directory, 'test.db')

  try {
    await run(path)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

const runDb = <A>(path: string, effect: Effect.Effect<A, unknown, Database>) =>
  Effect.runPromise(effect.pipe(Effect.provide(writeDatabase(path))))

const seedSummary = (path: string) =>
  runDb(
    path,
    Effect.gen(function* () {
      const db = yield* Database
      return yield* db.get<{
        cards: number
        regions: number
        changes: number
        unchanged: number
        public_players: number
        bad_names: number
      }>(sql`
        select
          count(distinct card_id) as cards,
          count(distinct region) as regions,
          sum(case when name_changes > 1 then 1 else 0 end) as changes,
          sum(case when name_changes = 0 then 1 else 0 end) as unchanged,
          sum(case when is_banned = 0 and last_seen_at >= ${Date.now() - 2_592_000_000}
            then 1 else 0 end) as public_players,
          (select count(*) from player_names
            where length(name) > 16 or length(name) < 3 or length(tag) < 3 or length(tag) > 5
          ) as bad_names
        from players
      `)
    }),
  )

describe('scale seed', () => {
  it('creates the requested counts, stays invariant-clean, and reseeds cleanly', async () => {
    await withDatabase('riotid-scale-seed-', async (path) => {
      await runDb(path, migrateDatabase(migrationsFolder))
      const result = await runDb(
        path,
        seedScaleDatabase({ players: 40, names: 80, regionChanges: 10, seed: 7 }),
      )

      expect(result).toMatchObject({ seeded: true, players: 40, names: 80, regionChanges: 10 })

      const stats = await runDb(path, databaseStats)
      expect(stats.players).toBe(40)
      expect(stats.nameIntervals).toBe(80)
      expect(stats.regionIntervals).toBe(50)
      expect(stats.runs).toBe(1)

      const report = await runDb(path, checkDatabase)
      expect(report.ok).toBe(true)

      const summary = await seedSummary(path)

      expect(summary?.cards ?? 0).toBeGreaterThanOrEqual(20)
      expect(summary?.regions ?? 0).toBe(4)
      expect(summary?.changes ?? 0).toBeGreaterThan(0)
      expect(summary?.unchanged ?? 0).toBeGreaterThan(0)
      expect(summary?.public_players ?? 0).toBeLessThan(40)
      expect(summary?.bad_names ?? 0).toBe(0)

      const firstPage = await runDb(path, listPlayersPage({ sort: 'name', limit: 3 }))
      expect(firstPage.players).toHaveLength(3)
      expect(firstPage.nextCursor).toBeTruthy()

      const seen = firstPage.players.map((player) => player.puuid)
      let cursor = firstPage.nextCursor ? decodePlayerCursor(firstPage.nextCursor) : null

      for (let page = 0; page < 20; page += 1) {
        const result: PlayerPage = await runDb(
          path,
          listPlayersPage({ sort: 'name', limit: 3, cursor }),
        )
        seen.push(...result.players.map((player) => player.puuid))
        cursor = result.nextCursor ? decodePlayerCursor(result.nextCursor) : null
        if (!cursor) break
      }

      expect(new Set(seen).size).toBe(seen.length)
      expect(seen.length).toBe(summary?.public_players)

      const sample = await runDb(path, listPlayersPage({ sort: 'name', limit: 1 }))
      const name = sample.players[0]?.name ?? ''
      expect(name).not.toBe('')
      const matches = await runDb(path, searchPlayers(name))
      expect(matches.current.players.some((player) => player.name === name)).toBe(true)

      await runDb(path, seedScaleDatabase({ players: 40, names: 80, regionChanges: 10, seed: 7 }))
      const again = await runDb(path, databaseStats)
      expect(again.players).toBe(40)
      expect(again.nameIntervals).toBe(80)
      expect((await runDb(path, checkDatabase)).ok).toBe(true)
    })
  })

  it('keeps identities inside Riot ID bounds with a varied card pool', async () => {
    await withDatabase('riotid-scale-realism-', async (path) => {
      await runDb(path, migrateDatabase(migrationsFolder))
      await runDb(
        path,
        seedScaleDatabase({ players: 5_000, names: 10_000, regionChanges: 400, seed: 3 }),
      )

      const summary = await seedSummary(path)
      expect(summary?.bad_names ?? 0).toBe(0)
      expect(summary?.cards ?? 0).toBeGreaterThanOrEqual(120)
      expect(summary?.regions).toBe(4)
      expect(summary?.changes ?? 0).toBeGreaterThan(500)
      expect(summary?.unchanged ?? 0).toBeGreaterThan(500)
      expect((await runDb(path, checkDatabase)).ok).toBe(true)
    })
  })
})
