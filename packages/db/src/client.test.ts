import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { eq, sql } from 'drizzle-orm'
import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { Database, migrateDatabase, readDatabase, writeDatabase } from './client.ts'
import { migrationsFolder } from './paths.ts'
import { playerNames, players } from './schema.ts'

const withDatabase = async (prefix: string, run: (path: string) => Promise<void>) => {
  const directory = await fs.mkdtemp(join(tmpdir(), prefix))
  const path = join(directory, 'test.db')

  try {
    await run(path)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

describe('database', () => {
  it('migrates an empty database and persists a player', async () => {
    await withDatabase('riotid-db-', async (path) => {
      const program = Effect.gen(function* () {
        yield* migrateDatabase(migrationsFolder)
        const db = yield* Database

        yield* db.insert(players).values({
          puuid: 'player-1',
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        })

        return yield* db.select().from(players)
      }).pipe(Effect.provide(writeDatabase(path)))

      const rows = await Effect.runPromise(program)

      expect(rows).toHaveLength(1)
      expect(rows[0]?.puuid).toBe('player-1')
    })
  })

  it('enforces one open name interval per player', async () => {
    await withDatabase('riotid-db-', async (path) => {
      const program = Effect.gen(function* () {
        yield* migrateDatabase(migrationsFolder)
        const db = yield* Database

        yield* db.insert(players).values({
          puuid: 'player-1',
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        })

        yield* db.insert(playerNames).values({
          puuid: 'player-1',
          name: 'First',
          tag: '0001',
          startedAt: new Date(),
        })

        const duplicate = yield* Effect.exit(
          db.insert(playerNames).values({
            puuid: 'player-1',
            name: 'Second',
            tag: '0002',
            startedAt: new Date(),
          }),
        )

        expect(Exit.isFailure(duplicate)).toBe(true)

        const open = yield* db.select().from(playerNames).where(eq(playerNames.puuid, 'player-1'))

        yield* db
          .update(playerNames)
          .set({ endedAt: new Date() })
          .where(eq(playerNames.id, open[0]?.id ?? -1))

        yield* db.insert(playerNames).values({
          puuid: 'player-1',
          name: 'Second',
          tag: '0002',
          startedAt: new Date(),
        })

        return yield* db.select().from(playerNames)
      }).pipe(Effect.provide(writeDatabase(path)))

      const rows = await Effect.runPromise(program)

      expect(rows).toHaveLength(2)
      expect(rows.filter((row) => row.endedAt === null)).toHaveLength(1)
    })
  })

  it('enforces foreign keys', async () => {
    await withDatabase('riotid-db-', async (path) => {
      const program = Effect.gen(function* () {
        yield* migrateDatabase(migrationsFolder)
        const db = yield* Database

        return yield* Effect.exit(
          db.insert(playerNames).values({
            puuid: 'missing-player',
            name: 'Orphan',
            tag: '0001',
            startedAt: new Date(),
          }),
        )
      }).pipe(Effect.provide(writeDatabase(path)))

      expect(Exit.isFailure(await Effect.runPromise(program))).toBe(true)
    })
  })

  it('rejects writes through the read-only layer', async () => {
    await withDatabase('riotid-db-', async (path) => {
      await Effect.runPromise(
        migrateDatabase(migrationsFolder).pipe(Effect.provide(writeDatabase(path))),
      )

      const program = Effect.gen(function* () {
        const db = yield* Database
        return yield* Effect.exit(
          db.insert(players).values({
            puuid: 'player-1',
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
          }),
        )
      }).pipe(Effect.provide(readDatabase(path)))

      expect(Exit.isFailure(await Effect.runPromise(program))).toBe(true)
    })
  })

  it('creates missing parent directories for a writable database', async () => {
    await withDatabase('riotid-db-', async (path) => {
      const nested = join(path, '..', 'fresh', 'nested', 'riotid.db')

      await Effect.runPromise(
        migrateDatabase(migrationsFolder).pipe(Effect.provide(writeDatabase(nested))),
      )

      const rows = await Effect.runPromise(
        Effect.gen(function* () {
          const db = yield* Database
          return yield* db.get<{ n: number }>(sql`select count(*) as n from players`)
        }).pipe(Effect.provide(readDatabase(nested))),
      )

      expect(rows?.n).toBe(0)
    })
  })
})
