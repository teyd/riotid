// @effect-diagnostics globalDate:off
import { eq, like, sql } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database } from './client.ts'
import {
  bannedPlayers,
  meta,
  playerNames,
  playerRegions,
  players,
  runs,
  seasons,
} from './schema.ts'

export type ScaleSeedOptions = {
  readonly players?: number
  readonly names?: number
  readonly regionChanges?: number
  readonly seed?: number
  readonly batchSize?: number
}

export type ScaleSeedResult = {
  readonly seeded: true
  readonly players: number
  readonly names: number
  readonly regionChanges: number
  readonly runId: number
  readonly elapsedMs: number
}

const regions = ['na', 'eu', 'ap', 'kr'] as const
const cards = [
  '1711d20d-4b1c-c64a-14be-d4ae58a457c6',
  'c8b2f5fd-4331-b172-f3b7-c8a26f356a1f',
  'eef542d2-4724-bc47-f53f-239f8c9c2623',
  'd32e58b1-4191-7315-ad4a-9da58b3f23dd',
  'd2d3caf9-499f-2ac8-9722-54961c3bcbf5',
  'e8787c31-4a39-9636-94a5-77b298d26ba7',
]
const adjectives = [
  'Neon',
  'Silent',
  'Rapid',
  'Crimson',
  'Frost',
  'Solar',
  'Lunar',
  'Vivid',
  'Iron',
  'Velvet',
  'Hollow',
  'Bright',
]
const nouns = [
  'Drift',
  'Comet',
  'Harbor',
  'Signal',
  'Echo',
  'Falcon',
  'Tiger',
  'Cipher',
  'Rocket',
  'Garden',
  'Nomad',
  'Pixel',
]
const suffixes = ['Prime', 'Old', 'Main', 'Arc', 'Nova', 'Zero', 'Echo', 'Void']
const dayMs = 86_400_000
const seasonUuid = '00000000-0000-4000-8000-000000000003'

const mulberry32 = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

const nameFor = (index: number): string => {
  const adjective = adjectives[index % adjectives.length] ?? 'Neon'
  const noun = nouns[Math.floor(index / adjectives.length) % nouns.length] ?? 'Drift'
  return `${adjective} ${noun} ${index.toString(36)}`
}

const tagFor = (index: number, salt: number, region: string): string =>
  `${region.toUpperCase()}${String((index * 37 + salt * 101) % 10_000).padStart(4, '0')}`

export const seedScaleDatabase = (
  options: ScaleSeedOptions = {},
): Effect.Effect<ScaleSeedResult, unknown, Database> =>
  Effect.gen(function* () {
    const started = Date.now()
    const db = yield* Database
    const playerCount = Math.max(1, Math.floor(options.players ?? 500_000))
    const nameCount = Math.max(playerCount, Math.floor(options.names ?? 1_000_000))
    const regionChangeCount = Math.max(
      0,
      Math.min(playerCount, Math.floor(options.regionChanges ?? 50_000)),
    )
    const batchSize = Math.max(50, Math.floor(options.batchSize ?? 500))
    const random = mulberry32(options.seed ?? 42)
    const now = new Date()
    const nowMs = now.getTime()
    const pastTotal = nameCount - playerCount
    const basePast = Math.floor(pastTotal / playerCount)
    const remainder = pastTotal - basePast * playerCount
    const extras = new Uint32Array(playerCount).fill(basePast)

    for (let index = 0; index < remainder; index += 1) {
      extras[index] = (extras[index] ?? 0) + 1
    }

    if (basePast > 0) {
      const pairs = Math.floor(playerCount / 4)

      for (let index = 0; index < pairs; index += 1) {
        extras[index] = (extras[index] ?? 0) - 1
        extras[pairs + index] = (extras[pairs + index] ?? 0) + 1
      }
    }

    const run = yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx.delete(players).where(like(players.puuid, 'seed-scale-%'))
        yield* tx.delete(runs).where(eq(runs.clientVersion, 'scale'))

        yield* tx
          .insert(seasons)
          .values({
            uuid: seasonUuid,
            displayName: 'Scale Act',
            type: 'EAresSeasonType::Act',
            startsAt: new Date(nowMs - 400 * dayMs),
            endsAt: new Date(nowMs + 30 * dayMs),
            isActive: true,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: seasons.uuid,
            set: {
              displayName: 'Scale Act',
              startsAt: new Date(nowMs - 400 * dayMs),
              endsAt: new Date(nowMs + 30 * dayMs),
              isActive: true,
              updatedAt: now,
            },
          })

        const insertedRun = yield* tx
          .insert(runs)
          .values({
            status: 'succeeded',
            trigger: 'manual',
            seasonId: seasonUuid,
            clientVersion: 'scale',
            startedAt: new Date(nowMs - 5 * 60_000),
            finishedAt: new Date(nowMs - 60_000),
            durationMs: 4 * 60_000,
            stats: {
              scale: true,
              players: playerCount,
              names: nameCount,
              regionChanges: regionChangeCount,
            },
            updatedAt: now,
          })
          .returning({ id: runs.id })
        const runId = insertedRun[0]?.id

        if (runId === undefined) {
          return yield* Effect.die('failed to insert scale seed run')
        }

        for (let start = 0; start < playerCount; start += batchSize) {
          const end = Math.min(playerCount, start + batchSize)
          const playerBatch: Array<typeof players.$inferInsert> = []
          const nameBatch: Array<typeof playerNames.$inferInsert> = []
          const regionBatch: Array<typeof playerRegions.$inferInsert> = []
          const banBatch: Array<typeof bannedPlayers.$inferInsert> = []

          for (let index = start; index < end; index += 1) {
            const puuid = `seed-scale-${String(index).padStart(9, '0')}`
            const region = regions[index % regions.length] ?? 'na'
            const firstSeenAt = nowMs - (60 + (index % 300)) * dayMs
            const stale = index % 17 === 0
            const lastSeenAt = stale
              ? nowMs - (31 + (index % 60)) * dayMs
              : nowMs - (index % 30) * dayMs
            const span = lastSeenAt - firstSeenAt
            const currentNameAt = firstSeenAt + Math.floor(span * 0.6)
            const nameSpan = currentNameAt - firstSeenAt
            const pastCount = extras[index] ?? 0
            const currentName = nameFor(index)
            const currentTag = tagFor(index, 0, region)
            const moved = index < regionChangeCount
            const currentRegionAt = firstSeenAt + Math.floor(span * 0.5)
            const banned = index % 40 === 0
            const unbanned = !banned && index % 37 === 0
            const nameChanges = pastCount
            const regionChanges = moved ? 1 : 0
            const banCount = banned || unbanned ? 1 : 0
            const unbanCount = unbanned ? 1 : 0
            const lastBanAt = banned ? Math.max(firstSeenAt, lastSeenAt - 10 * dayMs) : null
            const lastUnbanAt = unbanned ? firstSeenAt + Math.floor(span * 0.5) : null

            for (let past = 0; past < pastCount; past += 1) {
              const pastStart = firstSeenAt + Math.floor((nameSpan * past) / pastCount)
              const pastEnd = firstSeenAt + Math.floor((nameSpan * (past + 1)) / pastCount)
              nameBatch.push({
                puuid,
                name: `${currentName} ${suffixes[(index + past) % suffixes.length] ?? 'Prime'}`,
                tag: tagFor(index, past + 1, region),
                startedAt: new Date(pastStart),
                endedAt: new Date(pastEnd),
                startedRunId: runId,
                endedRunId: runId,
                updatedAt: now,
              })
            }

            nameBatch.push({
              puuid,
              name: currentName,
              tag: currentTag,
              startedAt: new Date(currentNameAt),
              startedRunId: runId,
              updatedAt: now,
            })

            if (moved) {
              regionBatch.push({
                puuid,
                region: regions[(index + 1) % regions.length] ?? 'eu',
                startedAt: new Date(firstSeenAt),
                endedAt: new Date(currentRegionAt),
                startedRunId: runId,
                endedRunId: runId,
                updatedAt: now,
              })
            }

            regionBatch.push({
              puuid,
              region,
              startedAt: new Date(moved ? currentRegionAt : firstSeenAt),
              startedRunId: runId,
              updatedAt: now,
            })

            if (banned) {
              banBatch.push({
                puuid,
                startedAt: new Date(lastBanAt ?? firstSeenAt),
                lastSeenAt: new Date(lastSeenAt),
                startedRunId: runId,
                updatedAt: now,
              })
            } else if (unbanned) {
              const banStart = firstSeenAt + Math.floor(span * 0.2)
              const banEnd = firstSeenAt + Math.floor(span * 0.35)
              banBatch.push({
                puuid,
                startedAt: new Date(banStart),
                endedAt: new Date(banEnd),
                lastSeenAt: new Date(banEnd),
                startedRunId: runId,
                endedRunId: runId,
                updatedAt: now,
              })
            }

            playerBatch.push({
              puuid,
              name: currentName,
              tag: currentTag,
              cardId: cards[index % cards.length] ?? null,
              region,
              isBanned: banned,
              isAnonymized: index % 17 === 0,
              firstSeenAt: new Date(firstSeenAt),
              lastSeenAt: new Date(lastSeenAt),
              firstSeenRunId: runId,
              lastSeenRunId: runId,
              timesSeen: 2 + (Math.floor(random() * 96) % 96),
              nameChanges,
              regionChanges,
              banCount,
              unbanCount,
              lastNameChangeAt: pastCount > 0 ? new Date(currentNameAt) : null,
              lastRegionChangeAt: moved ? new Date(currentRegionAt) : null,
              lastBanAt: lastBanAt === null ? null : new Date(lastBanAt),
              lastUnbanAt: lastUnbanAt === null ? null : new Date(lastUnbanAt),
              updatedAt: now,
            })
          }

          yield* tx.insert(players).values(playerBatch)
          yield* tx.insert(playerNames).values(nameBatch)
          if (regionBatch.length > 0) yield* tx.insert(playerRegions).values(regionBatch)
          if (banBatch.length > 0) yield* tx.insert(bannedPlayers).values(banBatch)
        }

        yield* tx
          .insert(meta)
          .values([
            { key: 'latestSuccessfulRunId', value: String(runId), updatedAt: now },
            {
              key: 'seed:scale',
              value: JSON.stringify({ players: playerCount, names: nameCount }),
              updatedAt: now,
            },
          ])
          .onConflictDoUpdate({
            target: meta.key,
            set: { value: sql`excluded.value`, updatedAt: now },
          })
        yield* tx
          .insert(meta)
          .values({ key: 'indexVersion', value: '1', updatedAt: now })
          .onConflictDoUpdate({
            target: meta.key,
            set: {
              value: sql`cast(${meta.value} as integer) + 1`,
              updatedAt: now,
            },
          })

        return runId
      }),
    )

    return {
      seeded: true,
      players: playerCount,
      names: nameCount,
      regionChanges: regionChangeCount,
      runId: run,
      elapsedMs: Date.now() - started,
    }
  })
