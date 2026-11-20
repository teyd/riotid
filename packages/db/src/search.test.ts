import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { isNotNull } from 'drizzle-orm'
import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { Database, migrateDatabase, writeDatabase } from './client.ts'
import { migrationsFolder } from './paths.ts'
import { searchPlayers } from './read-model.ts'
import { playerNames, players } from './schema.ts'
import { seedDatabase } from './seed.ts'

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

describe('player search', () => {
  it('finds current and closed names, then follows renames and removal', async () => {
    await withDatabase('riotid-search-', async (path) => {
      await runDb(
        path,
        Effect.gen(function* () {
          yield* migrateDatabase(migrationsFolder)
          const db = yield* Database

          yield* db.insert(players).values({
            puuid: 'search-player',
            name: 'Alpha Current',
            tag: '0001',
            region: 'na',
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
          })
          yield* db.insert(playerNames).values([
            {
              puuid: 'search-player',
              name: 'Alpha Old',
              tag: '0001',
              startedAt: new Date(1),
              endedAt: new Date(2),
            },
            {
              puuid: 'search-player',
              name: 'Alpha Current',
              tag: '0001',
              startedAt: new Date(2),
            },
          ])
        }),
      )

      const oldName = await runDb(path, searchPlayers('alpha old'))
      expect(oldName.current.total).toBe(0)
      expect(oldName.past.total).toBe(1)
      expect(oldName.past.matches[0]?.name).toBe('Alpha Old')
      expect(oldName.past.matches[0]?.player.name).toBe('Alpha Current')

      const currentName = await runDb(path, searchPlayers('alpha current'))
      expect(currentName.current.total).toBe(1)
      expect(currentName.past.total).toBe(0)

      const short = await runDb(path, searchPlayers('al'))
      expect(short.current.total).toBe(0)
      expect(short.past.total).toBe(0)

      await runDb(
        path,
        Effect.gen(function* () {
          const db = yield* Database
          yield* db.update(players).set({ name: 'Beta Current', tag: '0002' })
        }),
      )

      const renamed = await runDb(path, searchPlayers('beta current'))
      expect(renamed.current.total).toBe(1)
      expect(renamed.past.total).toBe(0)
      expect((await runDb(path, searchPlayers('alpha current'))).current.total).toBe(0)
      expect((await runDb(path, searchPlayers('alpha old'))).past.total).toBe(1)

      await runDb(
        path,
        Effect.gen(function* () {
          const db = yield* Database
          yield* db
            .update(playerNames)
            .set({ name: 'Gamma Past' })
            .where(isNotNull(playerNames.endedAt))
        }),
      )

      expect((await runDb(path, searchPlayers('gamma past'))).past.total).toBe(1)
      expect((await runDb(path, searchPlayers('alpha older'))).past.total).toBe(0)

      await runDb(
        path,
        Effect.gen(function* () {
          const db = yield* Database
          yield* db.delete(playerNames).where(isNotNull(playerNames.endedAt))
        }),
      )

      expect((await runDb(path, searchPlayers('gamma past'))).past.total).toBe(0)

      await runDb(
        path,
        Effect.gen(function* () {
          const db = yield* Database
          yield* db.delete(players)
        }),
      )

      const removed = await runDb(path, searchPlayers('alpha old'))
      expect(removed.current.total).toBe(0)
      expect(removed.past.total).toBe(0)
    })
  })

  it('excludes banned and stale players from seeded search', async () => {
    await withDatabase('riotid-search-seed-', async (path) => {
      await runDb(
        path,
        Effect.gen(function* () {
          yield* migrateDatabase(migrationsFolder)
          yield* seedDatabase
        }),
      )

      const current = await runDb(path, searchPlayers('seed'))
      expect(current.current.players.map((player) => player.puuid)).not.toContain('seed-player-3')
      expect(current.past.total).toBe(0)

      const banned = await runDb(path, searchPlayers('banned'))
      expect(banned.current.total).toBe(0)
      expect(banned.past.total).toBe(0)
    })
  })
})
