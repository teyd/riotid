import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  anonymousRows,
  bannedPlayers,
  Database,
  migrateDatabase,
  playerNames,
  playerRegions,
  leaderboardSeeds,
  players,
  runs,
  writeDatabase,
} from '@riotid/db'
import type { AuthSession, Leaderboard, LeaderboardPlayer } from '@riotid/riot'
import { eq, isNull } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { scan, type ScanResult } from './scan.ts'
import { RiotSource, type RiotSourceShape } from '@riotid/riot'

const migrationsFolder = fileURLToPath(new URL('../../db/drizzle', import.meta.url))

const session: AuthSession = {
  cookies: {},
  accessToken: 'test',
  idToken: 'test',
  entitlementsToken: 'test',
  region: 'eu',
  puuid: 'seed-account',
  country: 'DE',
  expiresAt: Date.now() + 3_600_000,
}

const act = {
  uuid: 'act-1',
  displayName: 'Test Act',
  startsAt: new Date('2026-01-01T00:00:00Z'),
  endsAt: new Date('2027-01-01T00:00:00Z'),
}

const player = (
  puuid: string,
  gameName: string,
  tagLine: string,
  options: { banned?: boolean; anonymized?: boolean } = {},
): LeaderboardPlayer => ({
  puuid,
  gameName,
  tagLine,
  leaderboardRank: 1,
  rankedRating: 1000,
  numberOfWins: 10,
  competitiveTier: 27,
  IsBanned: options.banned ?? false,
  IsAnonymized: options.anonymized ?? false,
  PlayerCardID: '00000000-0000-4000-8000-000000000010',
  TitleID: '00000000-0000-4000-8000-000000000011',
})

const anonymousPlayer = (): LeaderboardPlayer => ({
  ...player('', '', '', { anonymized: true }),
  leaderboardRank: 17,
})

const makeSource = (data: {
  readonly regions: Record<string, LeaderboardPlayer[]>
  readonly names: Map<string, { name: string; tag: string }>
  readonly failNames?: boolean
}): RiotSourceShape => {
  const regionPlayers = data.regions

  return {
    getVersion: Effect.succeed({ riotClientVersion: 'test-version' }),
    getActiveAct: Effect.succeed(act),
    getLeaderboard: (_session, _clientVersion, region, _seasonId, startIndex, size) => {
      const playersForRegion = regionPlayers[region] ?? []
      const page: Leaderboard = {
        SeasonID: act.uuid,
        totalPlayers: playersForRegion.length,
        Players: playersForRegion.slice(startIndex, startIndex + size),
      }

      return Effect.succeed(page)
    },
    getMmr: () => Effect.die('unused'),
    getMatchHistory: () => Effect.die('unused'),
    getMatchDetails: () => Effect.die('unused'),
    getNameService: (_session, _clientVersion, _shard, puuids) => {
      if (data.failNames) {
        return Effect.succeed([])
      }

      return Effect.succeed(
        puuids.flatMap((puuid) => {
          const name = data.names.get(puuid)
          return name ? [{ Subject: puuid, GameName: name.name, TagLine: name.tag }] : []
        }),
      )
    },
  }
}

const withScan = async (
  source: RiotSourceShape,
  run: (
    path: string,
    runScan: (options?: { trigger?: 'manual' | 'schedule' | 'boot' }) => Promise<ScanResult>,
  ) => Promise<void>,
): Promise<void> => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'riotid-scan-'))
  const path = join(directory, 'test.db')

  try {
    const layer = Layer.mergeAll(writeDatabase(path), Layer.succeed(RiotSource, source))

    await Effect.runPromise(
      migrateDatabase(migrationsFolder).pipe(Effect.provide(writeDatabase(path))),
    )

    await run(path, async (options) =>
      Effect.runPromise(
        scan({ session, trigger: options?.trigger ?? 'manual' }).pipe(Effect.provide(layer)),
      ),
    )
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

const readRows = async <A>(path: string, effect: Effect.Effect<A, unknown, Database>) =>
  Effect.runPromise(effect.pipe(Effect.provide(writeDatabase(path))))

describe('scan', () => {
  it('creates players, intervals, and anonymous rows on the first scan', async () => {
    const source = makeSource({
      regions: {
        eu: [player('p1', 'One', '0001'), player('p2', 'Two', '0002'), anonymousPlayer()],
        na: [player('p3', 'Three', '0003')],
      },
      names: new Map([
        ['p1', { name: 'One', tag: '0001' }],
        ['p2', { name: 'Two', tag: '0002' }],
        ['p3', { name: 'Three', tag: '0003' }],
      ]),
    })

    await withScan(source, async (path, runScan) => {
      const result = await runScan()
      expect(result.players).toBe(3)
      expect(result.anonymous).toBe(1)

      const rows = await readRows(
        path,
        Effect.gen(function* () {
          const db = yield* Database
          const allPlayers = yield* db.select().from(players)
          const openNames = yield* db.select().from(playerNames).where(isNull(playerNames.endedAt))
          const openRegions = yield* db
            .select()
            .from(playerRegions)
            .where(isNull(playerRegions.endedAt))
          const anonymous = yield* db.select().from(anonymousRows)
          const seeds = yield* db.select().from(leaderboardSeeds)
          const allRuns = yield* db.select().from(runs)

          return { allPlayers, openNames, openRegions, anonymous, seeds, allRuns }
        }),
      )

      expect(rows.allPlayers).toHaveLength(3)
      expect(rows.openNames).toHaveLength(3)
      expect(rows.openRegions).toHaveLength(3)
      expect(rows.anonymous).toHaveLength(1)
      expect(rows.seeds).toHaveLength(3)
      expect(rows.seeds.every((row) => row.leaderboardRank === 1)).toBe(true)
      expect(rows.allRuns[0]?.status).toBe('succeeded')
    })
  })

  it('is idempotent across identical reruns', async () => {
    const source = makeSource({
      regions: {
        eu: [player('p1', 'One', '0001'), player('p2', 'Two', '0002')],
        na: [player('p3', 'Three', '0003')],
      },
      names: new Map([
        ['p1', { name: 'One', tag: '0001' }],
        ['p2', { name: 'Two', tag: '0002' }],
        ['p3', { name: 'Three', tag: '0003' }],
      ]),
    })

    await withScan(source, async (path, runScan) => {
      await runScan()
      const second = await runScan()

      expect(second.nameChanges).toBe(0)
      expect(second.regionChanges).toBe(0)
      expect(second.bans).toBe(0)
      expect(second.unbans).toBe(0)

      const rows = await readRows(
        path,
        Effect.gen(function* () {
          const db = yield* Database
          const allPlayers = yield* db.select().from(players)
          const names = yield* db.select().from(playerNames)
          const regions = yield* db.select().from(playerRegions)
          return { allPlayers, names, regions }
        }),
      )

      expect(rows.allPlayers.every((row) => row.timesSeen === 2)).toBe(true)
      expect(rows.names).toHaveLength(3)
      expect(rows.regions).toHaveLength(3)
    })
  })

  it('keeps history when a name changes', async () => {
    const source = makeSource({
      regions: { eu: [player('p1', 'One', '0001')] },
      names: new Map([['p1', { name: 'One', tag: '0001' }]]),
    })

    await withScan(source, async (path, runScan) => {
      await runScan()

      source.getNameService = (_session, _version, _shard, puuids) =>
        Effect.succeed(
          puuids.map((puuid) => ({
            Subject: puuid,
            GameName: 'One New',
            TagLine: '0001',
          })),
        )

      const result = await runScan()
      expect(result.nameChanges).toBe(1)

      const rows = await readRows(
        path,
        Effect.gen(function* () {
          const db = yield* Database
          const current = yield* db.select().from(players).where(eq(players.puuid, 'p1'))
          const names = yield* db.select().from(playerNames).where(eq(playerNames.puuid, 'p1'))
          return { current: current[0], names }
        }),
      )

      expect(rows.current?.name).toBe('One New')
      expect(rows.names).toHaveLength(2)
      expect(rows.names.filter((row) => row.endedAt === null)).toHaveLength(1)
    })
  })

  it('keeps history when a player moves region', async () => {
    const source = makeSource({
      regions: { eu: [player('p1', 'One', '0001')] },
      names: new Map([['p1', { name: 'One', tag: '0001' }]]),
    })

    await withScan(source, async (path, runScan) => {
      await runScan()
      source.getLeaderboard = (_session, _version, region, _season, startIndex, size) => {
        const list = region === 'na' ? [player('p1', 'One', '0001')] : []
        return Effect.succeed({
          SeasonID: act.uuid,
          totalPlayers: list.length,
          Players: list.slice(startIndex, startIndex + size),
        })
      }

      const result = await runScan()
      expect(result.regionChanges).toBe(1)

      const rows = await readRows(
        path,
        Effect.gen(function* () {
          const db = yield* Database
          const current = yield* db.select().from(players).where(eq(players.puuid, 'p1'))
          const regions = yield* db
            .select()
            .from(playerRegions)
            .where(eq(playerRegions.puuid, 'p1'))
          return { current: current[0], regions }
        }),
      )

      expect(rows.current?.region).toBe('na')
      expect(rows.regions).toHaveLength(2)
      expect(rows.regions.filter((row) => row.endedAt === null)).toHaveLength(1)
    })
  })

  it('tracks ban and unban transitions', async () => {
    const source = makeSource({
      regions: { eu: [player('p1', 'One', '0001', { banned: true })] },
      names: new Map([['p1', { name: 'One', tag: '0001' }]]),
    })

    await withScan(source, async (path, runScan) => {
      await runScan()
      source.getLeaderboard = (_session, _version, region, _season, startIndex, size) => {
        const list = region === 'eu' ? [player('p1', 'One', '0001')] : []
        return Effect.succeed({
          SeasonID: act.uuid,
          totalPlayers: list.length,
          Players: list.slice(startIndex, startIndex + size),
        })
      }

      const result = await runScan()
      expect(result.bans).toBe(0)
      expect(result.unbans).toBe(1)

      const rows = await readRows(
        path,
        Effect.gen(function* () {
          const db = yield* Database
          const current = yield* db.select().from(players).where(eq(players.puuid, 'p1'))
          const bans = yield* db.select().from(bannedPlayers).where(eq(bannedPlayers.puuid, 'p1'))
          return { current: current[0], bans }
        }),
      )

      expect(rows.current?.isBanned).toBe(false)
      expect(rows.bans).toHaveLength(1)
      expect(rows.bans[0]?.endedAt).not.toBeNull()
    })
  })

  it('quarantines cross-region overlaps and counts page overlaps', async () => {
    const source = makeSource({
      regions: {
        eu: [player('p1', 'One', '0001'), player('p1', 'One', '0001')],
        na: [player('p1', 'One', '0001')],
      },
      names: new Map([['p1', { name: 'One', tag: '0001' }]]),
    })

    await withScan(source, async (path, runScan) => {
      const result = await runScan()
      expect(result.pageOverlaps).toBe(1)
      expect(result.crossRegionOverlaps).toBe(1)

      const rows = await readRows(
        path,
        Effect.gen(function* () {
          const db = yield* Database
          const current = yield* db.select().from(players).where(eq(players.puuid, 'p1'))
          const regions = yield* db
            .select()
            .from(playerRegions)
            .where(eq(playerRegions.puuid, 'p1'))
          return { current: current[0], regions }
        }),
      )

      expect(rows.current?.region).toBeNull()
      expect(rows.regions).toHaveLength(0)
    })
  })

  it('prunes anonymous rows that left the leaderboard', async () => {
    const source = makeSource({
      regions: { eu: [anonymousPlayer()] },
      names: new Map(),
    })

    await withScan(source, async (path, runScan) => {
      await runScan()
      source.getLeaderboard = () =>
        Effect.succeed({ SeasonID: act.uuid, totalPlayers: 0, Players: [] })

      await runScan()

      const rows = await readRows(
        path,
        Effect.gen(function* () {
          const db = yield* Database
          return yield* db.select().from(anonymousRows)
        }),
      )

      expect(rows).toHaveLength(0)
    })
  })

  it('keeps last known names when name-service is unavailable', async () => {
    const source = makeSource({
      regions: { eu: [player('p1', 'One', '0001')] },
      names: new Map([['p1', { name: 'One', tag: '0001' }]]),
    })

    await withScan(source, async (path, runScan) => {
      await runScan()
      source.getNameService = () => Effect.succeed([])

      const result = await runScan()
      expect(result.unresolvedNames).toBe(1)

      const rows = await readRows(
        path,
        Effect.gen(function* () {
          const db = yield* Database
          return yield* db.select().from(players).where(eq(players.puuid, 'p1'))
        }),
      )

      expect(rows[0]?.name).toBe('One')
    })
  })
})
