import { sql } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database } from './client.ts'
import {
  anonymousRows,
  bannedPlayers,
  identityLinks,
  leaderboardSeeds,
  matchCandidates,
  meta,
  playerNames,
  playerRegions,
  players,
  runRegions,
  runs,
  seasons,
} from './schema.ts'

export type SeedResult = {
  readonly seeded: boolean
  readonly runId: number | null
}

export const seedDatabase = Effect.gen(function* () {
  const db = yield* Database
  const existing = yield* db.get<{ value: string }>(sql`select value from meta where key = 'seed'`)

  if (existing) {
    return { seeded: false, runId: null } satisfies SeedResult
  }

  const now = new Date()
  const seasonUuid = '00000000-0000-4000-8000-000000000001'
  const firstRun = new Date(now.getTime() - 86_400_000)
  const olderRun = new Date(now.getTime() - 172_800_000)

  yield* db
    .insert(seasons)
    .values({
      uuid: seasonUuid,
      displayName: 'Seed Act',
      type: 'EAresSeasonType::Act',
      startsAt: olderRun,
      endsAt: new Date(now.getTime() + 86_400_000 * 30),
      isActive: true,
    })
    .onConflictDoNothing()

  const insertedRun = yield* db
    .insert(runs)
    .values({
      status: 'succeeded',
      trigger: 'manual',
      seasonId: seasonUuid,
      clientVersion: 'seed',
      startedAt: firstRun,
      finishedAt: new Date(firstRun.getTime() + 120_000),
      durationMs: 120_000,
      stats: { seeded: true },
    })
    .returning({ id: runs.id })
  const runId = insertedRun[0]?.id ?? null

  yield* db.insert(runRegions).values({
    runId: runId ?? -1,
    region: 'eu',
    status: 'succeeded',
    pages: 2,
    players: 3,
    staleNames: 0,
    unresolvedNames: 0,
    banned: 1,
    anonymized: 1,
    stats: { seeded: true },
  })

  yield* db
    .insert(players)
    .values([
      {
        puuid: 'seed-player-1',
        name: 'Seed One',
        tag: '0001',
        region: 'eu',
        firstSeenAt: olderRun,
        lastSeenAt: now,
        firstSeenRunId: runId,
        lastSeenRunId: runId,
        timesSeen: 2,
        nameChanges: 1,
        regionChanges: 0,
        lastNameChangeAt: now,
      },
      {
        puuid: 'seed-player-2',
        name: 'Seed Two',
        tag: '0002',
        region: 'eu',
        firstSeenAt: firstRun,
        lastSeenAt: now,
        firstSeenRunId: runId,
        lastSeenRunId: runId,
        timesSeen: 1,
      },
      {
        puuid: 'seed-player-3',
        name: 'Seed Banned',
        tag: '0003',
        region: 'eu',
        isBanned: true,
        firstSeenAt: firstRun,
        lastSeenAt: now,
        firstSeenRunId: runId,
        lastSeenRunId: runId,
        timesSeen: 1,
        banCount: 1,
        lastBanAt: now,
      },
    ])
    .onConflictDoNothing()

  yield* db.insert(playerNames).values([
    {
      puuid: 'seed-player-1',
      name: 'Seed One Old',
      tag: '0001',
      startedAt: olderRun,
      endedAt: firstRun,
      startedRunId: runId,
      endedRunId: runId,
    },
    {
      puuid: 'seed-player-1',
      name: 'Seed One',
      tag: '0001',
      startedAt: firstRun,
      startedRunId: runId,
    },
    {
      puuid: 'seed-player-2',
      name: 'Seed Two',
      tag: '0002',
      startedAt: firstRun,
      startedRunId: runId,
    },
    {
      puuid: 'seed-player-3',
      name: 'Seed Banned',
      tag: '0003',
      startedAt: firstRun,
      startedRunId: runId,
    },
  ])

  yield* db.insert(playerRegions).values([
    {
      puuid: 'seed-player-1',
      region: 'eu',
      startedAt: olderRun,
      startedRunId: runId,
    },
    {
      puuid: 'seed-player-2',
      region: 'eu',
      startedAt: firstRun,
      startedRunId: runId,
    },
    {
      puuid: 'seed-player-3',
      region: 'eu',
      startedAt: firstRun,
      startedRunId: runId,
    },
  ])

  yield* db.insert(bannedPlayers).values({
    puuid: 'seed-player-3',
    startedAt: firstRun,
    lastSeenAt: now,
    startedRunId: runId,
  })

  yield* db.insert(anonymousRows).values({
    region: 'eu',
    seasonId: seasonUuid,
    leaderboardRank: 17,
    rankedRating: 1090,
    numberOfWins: 88,
    competitiveTier: 27,
    cardId: '00000000-0000-4000-8000-000000000010',
    titleId: '00000000-0000-4000-8000-000000000011',
    status: 'unresolved',
    firstSeenAt: firstRun,
    lastSeenAt: now,
  })

  yield* db
    .insert(meta)
    .values([
      { key: 'seed', value: '1' },
      { key: 'indexVersion', value: '1' },
      ...(runId === null ? [] : [{ key: 'latestSuccessfulRunId', value: String(runId) }]),
    ])

  return { seeded: true, runId } satisfies SeedResult
})

const demoRegions = ['na', 'eu', 'ap', 'kr'] as const
const demoNames = [
  'goombastomper28',
  'Ascent Main',
  'Vex Orbit',
  'Sage Line',
  'Rift Runner',
  'Neon Harbor',
  'Split Shift',
  'Bind Signal',
  'Haven Light',
  'Lotus Bloom',
  'Fracture Fox',
  'Pearl Tide',
  'Icebox Echo',
  'Breeze Ghost',
  'Sunset Static',
  'Abyss Pilot',
  'Corrode',
  'Jett Lag',
  'Omen Main',
  'Cypher Cam',
  'Raze Rocket',
  'Breach Flash',
  'Skye Dog',
  'Killjoy Turret',
  'Astra Star',
  'Yoru Gate',
  'Phoenix Flash',
  'Reyna Leer',
]
const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000)
const demoCards = [
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000104',
  '00000000-0000-4000-8000-000000000105',
  '00000000-0000-4000-8000-000000000106',
]

export const seedDemoDatabase = Effect.gen(function* () {
  const db = yield* Database
  const existing = yield* db.get<{ value: string }>(
    sql`select value from meta where key = 'seed:demo'`,
  )

  if (existing) {
    return { seeded: false, runId: null } satisfies SeedResult
  }

  const partial = yield* db.get<{ n: number }>(
    sql`select count(*) as n from players where puuid like 'demo-player-%'`,
  )

  if ((partial?.n ?? 0) > 0) {
    yield* db
      .insert(meta)
      .values({ key: 'seed:demo', value: '1', updatedAt: new Date() })
      .onConflictDoNothing()
    return { seeded: false, runId: null } satisfies SeedResult
  }

  const now = new Date()
  const seasonUuid = '00000000-0000-4000-8000-000000000002'
  const seasonStart = daysAgo(now, 45)

  yield* db
    .insert(seasons)
    .values({
      uuid: seasonUuid,
      displayName: 'Demo Act',
      type: 'EAresSeasonType::Act',
      startsAt: seasonStart,
      endsAt: new Date(now.getTime() + 20 * 86_400_000),
      isActive: true,
    })
    .onConflictDoNothing()

  const startedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000)
  const finishedAt = new Date(now.getTime() - 60 * 60 * 1000)
  const insertedRun = yield* db
    .insert(runs)
    .values({
      status: 'succeeded',
      trigger: 'manual',
      seasonId: seasonUuid,
      clientVersion: 'demo',
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      stats: { demo: true, players: demoNames.length },
      updatedAt: finishedAt,
    })
    .returning({ id: runs.id })
  const runId = insertedRun[0]?.id ?? null

  const playerRows: Array<typeof players.$inferInsert> = []
  const nameRows: Array<typeof playerNames.$inferInsert> = []
  const regionRows: Array<typeof playerRegions.$inferInsert> = []
  const banRows: Array<typeof bannedPlayers.$inferInsert> = []
  const seedRows: Array<typeof leaderboardSeeds.$inferInsert> = []
  const linkedPlayers: Array<{
    puuid: string
    region: (typeof demoRegions)[number]
    index: number
  }> = []

  for (const [index, baseName] of demoNames.entries()) {
    const region = demoRegions[index % demoRegions.length] ?? 'na'
    const puuid = `demo-player-${String(index + 1).padStart(3, '0')}`
    const firstSeenAt = daysAgo(now, 220 - index * 5)
    const lastSeenAt = daysAgo(now, index % 6)
    const tagChange = index % 5 === 0
    const nameChangeCount = Math.max(
      index % 9 === 0 ? 2 : index % 4 === 0 ? 1 : 0,
      tagChange ? 1 : 0,
    )
    const finalTag =
      index === 0
        ? 'teyd'
        : tagChange
          ? `D${String(index + 1).padStart(3, '0')}`
          : `N${String(index + 1).padStart(3, '0')}`
    const oldTag = tagChange ? `X${String(index + 1).padStart(3, '0')}` : finalTag
    const regionMove = index % 7 === 0
    const oldRegion = demoRegions[(index + 1) % demoRegions.length] ?? 'eu'
    const isBanned = index % 11 === 0
    const unbanHistory = !isBanned && index % 9 === 0
    const linked = index % 8 === 0

    const mid = daysAgo(now, 20 - (index % 10))
    const early = daysAgo(now, 60 - index)
    const history =
      nameChangeCount === 0
        ? [{ name: baseName, tag: finalTag, start: firstSeenAt, end: null }]
        : nameChangeCount === 1
          ? [
              { name: `${baseName} Prime`, tag: oldTag, start: firstSeenAt, end: mid },
              { name: baseName, tag: finalTag, start: mid, end: null },
            ]
          : [
              { name: `${baseName} Prime`, tag: oldTag, start: firstSeenAt, end: early },
              { name: `${baseName} Old`, tag: oldTag, start: early, end: mid },
              { name: baseName, tag: finalTag, start: mid, end: null },
            ]

    for (const interval of history) {
      nameRows.push({
        puuid,
        name: interval.name,
        tag: interval.tag,
        startedAt: interval.start,
        endedAt: interval.end,
        startedRunId: runId,
        endedRunId: interval.end ? runId : null,
        updatedAt: now,
      })
    }

    if (regionMove) {
      regionRows.push({
        puuid,
        region: oldRegion,
        startedAt: firstSeenAt,
        endedAt: daysAgo(now, 30 + index),
        startedRunId: runId,
        endedRunId: runId,
        updatedAt: now,
      })
    }

    regionRows.push({
      puuid,
      region,
      startedAt: regionMove ? daysAgo(now, 30 + index) : firstSeenAt,
      startedRunId: runId,
      updatedAt: now,
    })

    const banStart = daysAgo(now, 14 + (index % 7))
    if (isBanned) {
      banRows.push({
        puuid,
        startedAt: banStart,
        lastSeenAt,
        startedRunId: runId,
        updatedAt: now,
      })
    } else if (unbanHistory) {
      banRows.push({
        puuid,
        startedAt: banStart,
        endedAt: daysAgo(now, 3),
        lastSeenAt: daysAgo(now, 3),
        startedRunId: runId,
        endedRunId: runId,
        updatedAt: now,
      })
    }

    seedRows.push({
      puuid,
      region,
      seasonId: seasonUuid,
      leaderboardRank: 100 + index * 37,
      rankedRating: 900 - index * 7,
      numberOfWins: 120 - index * 2,
      competitiveTier: index % 3 === 0 ? 27 : index % 2 === 0 ? 26 : 25,
      lastSeenAt,
      updatedAt: now,
    })

    playerRows.push({
      puuid,
      name: baseName,
      tag: finalTag,
      cardId: demoCards[index % demoCards.length] ?? null,
      region,
      isBanned,
      isAnonymized: linked,
      firstSeenAt,
      lastSeenAt,
      firstSeenRunId: runId,
      lastSeenRunId: runId,
      timesSeen: 3 + (index % 12),
      nameChanges: nameChangeCount,
      regionChanges: regionMove ? 1 : 0,
      banCount: isBanned || unbanHistory ? 1 : 0,
      unbanCount: unbanHistory ? 1 : 0,
      lastNameChangeAt: nameChangeCount > 0 ? (history[history.length - 1]?.start ?? null) : null,
      lastRegionChangeAt: regionMove ? daysAgo(now, 30 + index) : null,
      lastBanAt: isBanned || unbanHistory ? banStart : null,
      lastUnbanAt: unbanHistory ? daysAgo(now, 3) : null,
      updatedAt: now,
    })

    if (linked) linkedPlayers.push({ puuid, region, index })
  }

  yield* db.insert(players).values(playerRows)
  yield* db.insert(playerNames).values(nameRows)
  yield* db.insert(playerRegions).values(regionRows)
  yield* db.insert(bannedPlayers).values(banRows)
  yield* db.insert(leaderboardSeeds).values(seedRows)

  const cardId = '00000000-0000-4000-8000-000000000010'
  const titleId = '00000000-0000-4000-8000-000000000011'

  for (const [regionIndex, region] of demoRegions.entries()) {
    for (let slot = 0; slot < 3; slot += 1) {
      yield* db.insert(anonymousRows).values({
        region,
        seasonId: seasonUuid,
        leaderboardRank: 250 + slot * 41 + regionIndex,
        rankedRating: 640 - slot * 18,
        numberOfWins: 64 - slot * 4,
        competitiveTier: 27 - (slot % 2),
        cardId,
        titleId,
        status: 'unresolved',
        firstSeenAt: daysAgo(now, 10),
        lastSeenAt: now,
        updatedAt: now,
      })
    }
  }

  for (const linked of linkedPlayers) {
    const inserted = yield* db
      .insert(anonymousRows)
      .values({
        region: linked.region,
        seasonId: seasonUuid,
        leaderboardRank: 600 + linked.index,
        rankedRating: 880 - linked.index * 5,
        numberOfWins: 140 - linked.index * 2,
        competitiveTier: 27,
        cardId,
        titleId,
        puuid: linked.puuid,
        resolvedPuuid: linked.puuid,
        status: 'linked',
        firstSeenAt: daysAgo(now, 12),
        lastSeenAt: now,
        lastTriedAt: now,
        updatedAt: now,
      })
      .returning({ id: anonymousRows.id })
    const anonymousRowId = inserted[0]?.id
    if (!anonymousRowId) continue

    yield* db.insert(identityLinks).values({
      anonymousRowId,
      puuid: linked.puuid,
      region: linked.region,
      seasonId: seasonUuid,
      matchId: `demo-match-${String(linked.index + 1).padStart(3, '0')}`,
      method: 'match_graph',
      confidence: 9_995,
      evidence: {
        leaderboardRank: 600 + linked.index,
        rankedRating: 880 - linked.index * 5,
        numberOfWins: 140 - linked.index * 2,
        competitiveTier: 27,
        cardId,
        titleId,
      },
      updatedAt: now,
    })
  }

  yield* db.insert(matchCandidates).values(
    linkedPlayers.map((linked) => ({
      matchId: `demo-match-${String(linked.index + 1).padStart(3, '0')}`,
      puuid: linked.puuid,
      region: linked.region,
      gameStartAt: daysAgo(now, 2),
      cardId,
      titleId,
      accountLevel: 200 + linked.index,
      competitiveTier: 27,
      updatedAt: now,
    })),
  )

  yield* db.insert(runRegions).values(
    demoRegions.map((region) => ({
      runId: runId ?? -1,
      region,
      status: 'succeeded' as const,
      pages: 2,
      players: 7,
      pageOverlaps: 0,
      crossRegionOverlaps: 1,
      staleNames: 0,
      unresolvedNames: 0,
      banned: 0,
      anonymized: 3,
      stats: { demo: true, rows: 7, unique: 7, anonymized: 3 },
      updatedAt: finishedAt,
    })),
  )

  yield* db
    .insert(meta)
    .values([
      { key: 'seed:demo', value: '1', updatedAt: now },
      { key: 'indexVersion', value: '1', updatedAt: now },
      ...(runId ? [{ key: 'latestSuccessfulRunId', value: String(runId), updatedAt: now }] : []),
    ])

  return { seeded: true, runId } satisfies SeedResult
})
