import { sql } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database } from './client.ts'
import {
  anonymousRows,
  meta,
  playerNames,
  playerRegions,
  players,
  runRegions,
  runs,
  seasons,
  bannedPlayers,
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
      ...(runId === null ? [] : [{ key: 'latestSuccessfulRunId', value: String(runId) }]),
    ])

  return { seeded: true, runId } satisfies SeedResult
})
