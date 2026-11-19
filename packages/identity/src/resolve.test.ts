import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  anonymousRows,
  Database,
  identityLinks,
  leaderboardSeeds,
  matchCandidates,
  migrateDatabase,
  playerNames,
  playerRegions,
  players,
  writeDatabase,
} from '@riotid/db'
import { RiotSource, type AuthSession, type MatchDetails, type RiotSourceShape } from '@riotid/riot'
import { eq } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { matchCacheStats, pruneMatchCache } from './cache.ts'
import { resolveAnonymous } from './resolve.ts'

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

type Fingerprint = {
  LeaderboardRank: number
  RankedRating: number
  NumberOfWins: number
  CompetitiveTier: number
}

const fingerprint = (overrides: Partial<Fingerprint> = {}): Fingerprint => ({
  LeaderboardRank: 100,
  RankedRating: 500,
  NumberOfWins: 20,
  CompetitiveTier: 27,
  ...overrides,
})

type SourceData = {
  readonly mmr?: Map<string, Fingerprint>
  readonly history?: Map<string, ReadonlyArray<{ matchId: string; gameStartTime: number }>>
  readonly matches?: Map<string, MatchDetails>
  readonly names?: Map<string, { name: string; tag: string }>
}

const makeSource = (data: SourceData): RiotSourceShape => ({
  getVersion: Effect.succeed({ riotClientVersion: 'test-version' }),
  getActiveAct: Effect.succeed(act),
  getLeaderboard: () => Effect.die('unused'),
  getNameService: (_session, _version, _shard, puuids) =>
    Effect.succeed(
      puuids.flatMap((puuid) => {
        const name = data.names?.get(puuid)
        return name ? [{ Subject: puuid, GameName: name.name, TagLine: name.tag }] : []
      }),
    ),
  getMmr: (_session, _version, _shard, puuid) => {
    const value = data.mmr?.get(puuid)
    return value
      ? Effect.succeed({
          Subject: puuid,
          QueueSkills: { competitive: { SeasonalInfoBySeasonID: { 'act-1': value } } },
        })
      : Effect.die(`unexpected mmr request for ${puuid}`)
  },
  getMatchHistory: (_session, _version, _shard, puuid) => {
    const matches = data.history?.get(puuid) ?? []
    return Effect.succeed({
      History: matches.map((match) => ({
        MatchID: match.matchId,
        GameStartTime: match.gameStartTime,
        QueueID: 'competitive',
      })),
    })
  },
  getMatchDetails: (_session, _version, _shard, matchId) => {
    const details = data.matches?.get(matchId)
    return details ? Effect.succeed(details) : Effect.die(`unexpected match ${matchId}`)
  },
})

const participant = (
  subject: string,
  overrides: Partial<MatchDetails['players'][number]> = {},
): MatchDetails['players'][number] => ({
  subject,
  gameName: subject,
  tagLine: '0001',
  playerCard: 'card-1',
  playerTitle: 'title-1',
  accountLevel: 100,
  competitiveTier: 27,
  ...overrides,
})

const anonymousRow = (overrides: Partial<typeof anonymousRows.$inferInsert> = {}) => {
  const now = new Date()

  return {
    region: 'eu' as const,
    seasonId: 'act-1',
    leaderboardRank: 100,
    rankedRating: 500,
    numberOfWins: 20,
    competitiveTier: 27,
    cardId: 'card-1',
    titleId: 'title-1',
    status: 'unresolved' as const,
    firstSeenAt: now,
    lastSeenAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const withDatabase = async (run: (path: string) => Promise<void>): Promise<void> => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'riotid-identity-'))
  const path = join(directory, 'test.db')

  try {
    await Effect.runPromise(
      migrateDatabase(migrationsFolder).pipe(Effect.provide(writeDatabase(path))),
    )
    await run(path)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

const run = <A>(
  path: string,
  source: RiotSourceShape,
  effect: Effect.Effect<A, unknown, Database | import('@riotid/riot').RiotSource>,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(Layer.mergeAll(writeDatabase(path), Layer.succeed(RiotSource, source))),
    ),
  )

const config = {
  session,
  budget: 1000,
  seeds: 0,
  coverageTarget: 0.9,
  cacheEnabled: true,
  cacheMatchesPerRegion: 1000,
  cacheMaxMatchesPerRegion: 10_000,
  autotune: false,
  limit: 500,
}

describe('anonymous identity resolution', () => {
  it('links a direct puuid row without a match', async () => {
    await withDatabase(async (path) => {
      const source = makeSource({
        names: new Map([['p-direct', { name: 'Direct', tag: '0001' }]]),
      })

      const result = await run(
        path,
        source,
        Effect.gen(function* () {
          const db = yield* Database
          yield* db.insert(anonymousRows).values(anonymousRow({ puuid: 'p-direct' }))
          return yield* resolveAnonymous(config)
        }),
      )

      expect(result.linked).toBe(1)

      const rows = await run(
        path,
        source,
        Effect.gen(function* () {
          const db = yield* Database
          const player = yield* db.select().from(players).where(eq(players.puuid, 'p-direct'))
          const names = yield* db.select().from(playerNames)
          const regions = yield* db.select().from(playerRegions)
          const links = yield* db.select().from(identityLinks)
          const anonymous = yield* db.select().from(anonymousRows)
          return { player: player[0], names, regions, links, anonymous: anonymous[0] }
        }),
      )

      expect(rows.player?.isAnonymized).toBe(true)
      expect(rows.player?.name).toBe('Direct')
      expect(rows.names).toHaveLength(1)
      expect(rows.regions).toHaveLength(1)
      expect(rows.links[0]?.method).toBe('direct_puuid')
      expect(rows.links[0]?.matchId).toBeNull()
      expect(rows.anonymous?.status).toBe('linked')
      expect(rows.anonymous?.resolvedPuuid).toBe('p-direct')
    })
  })

  it('links a cached match candidate whose MMR fingerprint matches', async () => {
    await withDatabase(async (path) => {
      const source = makeSource({
        mmr: new Map([['p-cache', fingerprint()]]),
        names: new Map([['p-cache', { name: 'Cached', tag: '0002' }]]),
      })

      const result = await run(
        path,
        source,
        Effect.gen(function* () {
          const db = yield* Database
          yield* db.insert(anonymousRows).values(anonymousRow())
          yield* db.insert(matchCandidates).values({
            matchId: 'm-cache',
            puuid: 'p-cache',
            region: 'eu',
            gameStartAt: new Date(),
            cardId: 'card-1',
            titleId: 'title-1',
            accountLevel: 120,
            competitiveTier: 27,
          })
          return yield* resolveAnonymous(config)
        }),
      )

      expect(result.linked).toBe(1)

      const link = await run(
        path,
        source,
        Effect.gen(function* () {
          const db = yield* Database
          return (yield* db.select().from(identityLinks))[0]
        }),
      )

      expect(link?.method).toBe('match_graph')
      expect(link?.matchId).toBe('m-cache')
      expect(link?.confidence).toBeGreaterThanOrEqual(9990)
    })
  })

  it('refuses to link when several candidates match', async () => {
    await withDatabase(async (path) => {
      const source = makeSource({
        mmr: new Map([
          ['p-one', fingerprint()],
          ['p-two', fingerprint()],
        ]),
      })

      const result = await run(
        path,
        source,
        Effect.gen(function* () {
          const db = yield* Database
          yield* db.insert(anonymousRows).values(anonymousRow())
          yield* db.insert(matchCandidates).values([
            {
              matchId: 'm-one',
              puuid: 'p-one',
              region: 'eu',
              gameStartAt: new Date(),
              cardId: 'card-1',
              titleId: 'title-1',
              accountLevel: 100,
              competitiveTier: 27,
            },
            {
              matchId: 'm-two',
              puuid: 'p-two',
              region: 'eu',
              gameStartAt: new Date(),
              cardId: 'card-1',
              titleId: 'title-1',
              accountLevel: 100,
              competitiveTier: 27,
            },
          ])
          return yield* resolveAnonymous(config)
        }),
      )

      expect(result.linked).toBe(0)
      expect(result.ambiguous).toBe(1)

      const anonymous = await run(
        path,
        source,
        Effect.gen(function* () {
          const db = yield* Database
          return (yield* db.select().from(anonymousRows))[0]
        }),
      )

      expect(anonymous?.status).toBe('unresolved')
    })
  })

  it('ignores candidates whose card does not match the row', async () => {
    await withDatabase(async (path) => {
      const source = makeSource({ mmr: new Map([['p-card', fingerprint()]]) })

      const result = await run(
        path,
        source,
        Effect.gen(function* () {
          const db = yield* Database
          yield* db.insert(anonymousRows).values(anonymousRow())
          yield* db.insert(matchCandidates).values({
            matchId: 'm-card',
            puuid: 'p-card',
            region: 'eu',
            gameStartAt: new Date(),
            cardId: 'different-card',
            titleId: 'title-1',
            accountLevel: 100,
            competitiveTier: 27,
          })
          return yield* resolveAnonymous(config)
        }),
      )

      expect(result.linked).toBe(0)
      expect(result.requests).toBe(0)
    })
  })

  it('seeds the match cache from nearby known players', async () => {
    await withDatabase(async (path) => {
      const source = makeSource({
        mmr: new Map([['p-fresh', fingerprint()]]),
        history: new Map([
          ['seed-player', [{ matchId: 'm-fresh', gameStartTime: 1_700_000_000_000 }]],
        ]),
        matches: new Map([
          [
            'm-fresh',
            {
              players: [participant('p-fresh', { gameName: 'Fresh', tagLine: '0003' })],
            },
          ],
        ]),
      })

      const result = await run(
        path,
        source,
        Effect.gen(function* () {
          const db = yield* Database
          yield* db.insert(anonymousRows).values(anonymousRow())
          yield* db.insert(players).values({
            puuid: 'seed-player',
            name: 'Seed',
            tag: '0009',
            region: 'eu',
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            updatedAt: new Date(),
          })
          return yield* resolveAnonymous({ ...config, seeds: 1 })
        }),
      )

      expect(result.seeds).toBe(1)
      expect(result.matchesFetched).toBe(1)
      expect(result.linked).toBe(1)

      const cache = await run(path, source, matchCacheStats)
      expect(cache.matches).toBe(1)
      expect(cache.rows).toBe(1)
    })
  })

  it('prefers seed players near the anonymous rank', async () => {
    await withDatabase(async (path) => {
      const source = makeSource({
        mmr: new Map([['p-near', fingerprint()]]),
        history: new Map([
          ['near-player', [{ matchId: 'm-near', gameStartTime: 1_700_000_000_000 }]],
        ]),
        matches: new Map([
          ['m-near', { players: [participant('p-near', { gameName: 'Near', tagLine: '0004' })] }],
        ]),
      })

      const result = await run(
        path,
        source,
        Effect.gen(function* () {
          const db = yield* Database
          yield* db.insert(anonymousRows).values(anonymousRow({ leaderboardRank: 100 }))
          yield* db.insert(players).values([
            {
              puuid: 'near-player',
              name: 'Near Seed',
              tag: '0001',
              region: 'eu',
              firstSeenAt: new Date(),
              lastSeenAt: new Date(),
              updatedAt: new Date(),
            },
            {
              puuid: 'far-player',
              name: 'Far Seed',
              tag: '0002',
              region: 'eu',
              firstSeenAt: new Date(),
              lastSeenAt: new Date(),
              updatedAt: new Date(),
            },
          ])
          yield* db.insert(leaderboardSeeds).values([
            {
              puuid: 'near-player',
              region: 'eu',
              seasonId: 'act-1',
              leaderboardRank: 95,
              rankedRating: 520,
              numberOfWins: 21,
              competitiveTier: 27,
              lastSeenAt: new Date(),
              updatedAt: new Date(),
            },
            {
              puuid: 'far-player',
              region: 'eu',
              seasonId: 'act-1',
              leaderboardRank: 5000,
              rankedRating: 100,
              numberOfWins: 5,
              competitiveTier: 15,
              lastSeenAt: new Date(),
              updatedAt: new Date(),
            },
          ])
          return yield* resolveAnonymous({ ...config, seeds: 1 })
        }),
      )

      expect(result.seeds).toBe(1)
      expect(result.linked).toBe(1)
    })
  })

  it('respects the daily request budget', async () => {
    await withDatabase(async (path) => {
      const source = makeSource({
        mmr: new Map([
          ['p-budget-one', fingerprint()],
          ['p-budget-two', fingerprint()],
        ]),
      })

      const result = await run(
        path,
        source,
        Effect.gen(function* () {
          const db = yield* Database
          yield* db
            .insert(anonymousRows)
            .values([anonymousRow(), anonymousRow({ leaderboardRank: 101 })])
          yield* db.insert(matchCandidates).values([
            {
              matchId: 'm-budget-one',
              puuid: 'p-budget-one',
              region: 'eu',
              gameStartAt: new Date(),
              cardId: 'card-1',
              titleId: 'title-1',
              accountLevel: 100,
              competitiveTier: 27,
            },
            {
              matchId: 'm-budget-two',
              puuid: 'p-budget-two',
              region: 'eu',
              gameStartAt: new Date(Date.now() - 1000),
              cardId: 'card-1',
              titleId: 'title-1',
              accountLevel: 100,
              competitiveTier: 27,
            },
          ])
          return yield* resolveAnonymous({ ...config, budget: 1, limit: 10 })
        }),
      )

      expect(result.requests).toBe(1)
      expect(result.linked).toBeLessThanOrEqual(1)
    })
  })

  it('prunes stale and excess match candidates', async () => {
    await withDatabase(async (path) => {
      const source = makeSource({})
      const now = Date.now()

      const result = await run(
        path,
        source,
        Effect.gen(function* () {
          const db = yield* Database
          yield* db.insert(matchCandidates).values([
            {
              matchId: 'm-old',
              puuid: 'p-old',
              region: 'eu',
              gameStartAt: new Date(now - 50 * 86_400_000),
              cardId: 'card-1',
              titleId: 'title-1',
              accountLevel: 100,
              competitiveTier: 27,
              createdAt: new Date(now - 50 * 86_400_000),
              updatedAt: new Date(now - 50 * 86_400_000),
            },
            {
              matchId: 'm-new',
              puuid: 'p-new',
              region: 'eu',
              gameStartAt: new Date(now - 1000),
              cardId: 'card-1',
              titleId: 'title-1',
              accountLevel: 100,
              competitiveTier: 27,
            },
            {
              matchId: 'm-older',
              puuid: 'p-older',
              region: 'eu',
              gameStartAt: new Date(now - 5000),
              cardId: 'card-1',
              titleId: 'title-1',
              accountLevel: 100,
              competitiveTier: 27,
            },
          ])
          return yield* pruneMatchCache({ olderThanDays: 30, matchesPerRegion: 1, now })
        }),
      )

      expect(result.deleted).toBe(2)
      const stats = await run(path, source, matchCacheStats)
      expect(stats.matches).toBe(1)
      expect(stats.perRegion.eu?.matches).toBe(1)
    })
  })
})
