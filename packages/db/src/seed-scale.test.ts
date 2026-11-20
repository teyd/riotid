import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { PlayerPage } from '@riotid/contracts'
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
      expect(seen.length).toBe(37)

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
})
