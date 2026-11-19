import { migrationsFolder, runDb, withDatabase } from '@riotid/test-utils'
import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { checkDatabase } from './check.ts'
import { Database, migrateDatabase } from './client.ts'
import { playerNames } from './schema.ts'
import { seedDatabase } from './seed.ts'

describe('seed and invariants', () => {
  it('seeds once and passes the invariant check', async () => {
    await withDatabase('riotid-seed-', async (path) => {
      const program = Effect.gen(function* () {
        yield* migrateDatabase(migrationsFolder)
        const first = yield* seedDatabase
        const second = yield* seedDatabase
        const report = yield* checkDatabase

        return { first, second, report }
      })

      const { first, second, report } = await runDb(path, program)

      expect(first.seeded).toBe(true)
      expect(second.seeded).toBe(false)
      expect(report.ok).toBe(true)
      expect(report.counts.nameOverlaps).toBe(0)
    })
  })

  it('detects overlapping closed name intervals', async () => {
    await withDatabase('riotid-seed-', async (path) => {
      const program = Effect.gen(function* () {
        yield* migrateDatabase(migrationsFolder)
        yield* seedDatabase

        const db = yield* Database
        const now = Date.now()

        yield* db.insert(playerNames).values([
          {
            puuid: 'seed-player-1',
            name: 'Overlap A',
            tag: '0001',
            startedAt: new Date(now - 60_000),
            endedAt: new Date(now + 60_000),
            startedRunId: 1,
            endedRunId: 1,
          },
          {
            puuid: 'seed-player-1',
            name: 'Overlap B',
            tag: '0002',
            startedAt: new Date(now),
            endedAt: new Date(now + 120_000),
            startedRunId: 1,
            endedRunId: 1,
          },
        ])

        return yield* checkDatabase
      })

      const report = await runDb(path, program)

      expect(report.ok).toBe(false)
      expect(report.counts.nameOverlaps).toBeGreaterThan(0)
    })
  })
})
