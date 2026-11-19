// @effect-diagnostics globalDate:off globalDateInEffect:off
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import {
  anonymousRows,
  bannedPlayers,
  Database,
  leaderboardSeeds,
  meta,
  playerNames,
  playerRegions,
  players,
  runRegions,
  runs,
  seasons,
} from '@riotid/db'
import {
  RiotRequestError,
  RiotSource,
  type AuthSession,
  type LeaderboardPlayer,
} from '@riotid/riot'
import { Clock, Data, Duration, Effect } from 'effect'

const regions = ['na', 'eu', 'ap', 'kr'] as const
type Region = (typeof regions)[number]
const pageSize = 510
const maxPagesPerRegion = 200
const nameBatchSize = 10_000

export type ScanTrigger = 'schedule' | 'manual' | 'boot'

export class ScanLockedError extends Data.TaggedError('ScanLockedError')<{
  readonly message: string
}> {}

export class ScanFailedError extends Data.TaggedError('ScanFailedError')<{
  readonly message: string
}> {}

export type ScanOptions = {
  readonly session: AuthSession
  readonly trigger: ScanTrigger
}

export type ScanResult = {
  readonly runId: number
  readonly players: number
  readonly nameChanges: number
  readonly regionChanges: number
  readonly bans: number
  readonly unbans: number
  readonly anonymous: number
  readonly pageOverlaps: number
  readonly crossRegionOverlaps: number
  readonly unresolvedNames: number
}

type CrawledRegion = {
  readonly region: Region
  readonly pages: number
  readonly rows: number
  readonly players: ReadonlyArray<LeaderboardPlayer>
  readonly anonymous: ReadonlyArray<LeaderboardPlayer>
  readonly pageOverlaps: number
  readonly banned: number
  readonly anonymized: number
}

type ObservedPlayer = {
  readonly player: LeaderboardPlayer
  readonly regions: Set<Region>
}

const chunks = <A>(items: ReadonlyArray<A>, size: number): A[][] => {
  const result: A[][] = []

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }

  return result
}

const lower = (value: string): string => value.toLowerCase()

const crawlRegion = (
  session: AuthSession,
  clientVersion: string,
  seasonId: string,
  region: Region,
): Effect.Effect<CrawledRegion, RiotRequestError, RiotSource> =>
  Effect.gen(function* () {
    const source = yield* RiotSource
    const seen = new Set<string>()
    const found: LeaderboardPlayer[] = []
    const anonymous: LeaderboardPlayer[] = []
    let start = 0
    let pages = 0
    let rows = 0
    let pageOverlaps = 0
    let banned = 0
    let anonymized = 0

    while (pages < maxPagesPerRegion) {
      const page = yield* source.getLeaderboard(
        session,
        clientVersion,
        region,
        seasonId,
        start,
        pageSize,
      )

      pages += 1
      rows += page.Players.length

      if (page.Players.length === 0) {
        break
      }

      for (const player of page.Players) {
        if (player.IsBanned) {
          banned += 1
        }

        const puuid = player.puuid ? lower(player.puuid) : ''

        if (player.IsAnonymized || puuid.length === 0) {
          anonymized += 1
          anonymous.push(player)
          continue
        }

        if (seen.has(puuid)) {
          pageOverlaps += 1
          continue
        }

        seen.add(puuid)
        found.push({ ...player, puuid })
      }

      start += page.Players.length

      if (page.Players.length < pageSize || start >= page.totalPlayers) {
        break
      }

      yield* Effect.sleep(Duration.millis(150))
    }

    return {
      region,
      pages,
      rows,
      players: found,
      anonymous,
      pageOverlaps,
      banned,
      anonymized,
    }
  })

const resolveNames = (
  session: AuthSession,
  clientVersion: string,
  observed: ReadonlyMap<string, ObservedPlayer>,
): Effect.Effect<Map<string, { name: string; tag: string }>, never, RiotSource> =>
  Effect.gen(function* () {
    const source = yield* RiotSource
    const grouped = new Map<string, string[]>()

    for (const [puuid, entry] of observed) {
      const region = [...entry.regions][0]

      if (region) {
        const list = grouped.get(region) ?? []
        list.push(puuid)
        grouped.set(region, list)
      }
    }

    const resolved = new Map<string, { name: string; tag: string }>()

    for (const [region, puuids] of grouped) {
      for (const batch of chunks(puuids, nameBatchSize)) {
        const names = yield* source
          .getNameService(session, clientVersion, region, batch)
          .pipe(Effect.catchTag('RiotRequestError', () => Effect.succeed([])))

        for (const entry of names) {
          if (entry.GameName.length > 0) {
            resolved.set(lower(entry.Subject), {
              name: entry.GameName,
              tag: entry.TagLine,
            })
          }
        }
      }
    }

    return resolved
  })

const nowDate = (millis: number): Date => new Date(millis)

export const scan = (
  options: ScanOptions,
): Effect.Effect<ScanResult, unknown, Database | RiotSource> =>
  Effect.gen(function* () {
    const db = yield* Database
    const source = yield* RiotSource
    const started = yield* Clock.currentTimeMillis
    const startedAt = nowDate(started)
    const staleBefore = nowDate(started - 60 * 60 * 1000)

    yield* db
      .update(runs)
      .set({
        status: 'failed',
        error: 'interrupted',
        finishedAt: startedAt,
        updatedAt: startedAt,
      })
      .where(and(eq(runs.status, 'running'), lt(runs.startedAt, staleBefore)))

    const running = yield* db.get<{ n: number }>(
      sql`select count(*) as n from runs where status = 'running'`,
    )

    if ((running?.n ?? 0) > 0) {
      return yield* new ScanLockedError({
        message: 'Another scan is already running.',
      })
    }

    const version = yield* source.getVersion
    const act = yield* source.getActiveAct

    yield* db
      .insert(seasons)
      .values({
        uuid: act.uuid,
        displayName: act.displayName,
        type: 'EAresSeasonType::Act',
        startsAt: act.startsAt,
        endsAt: act.endsAt,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: seasons.uuid,
        set: {
          displayName: act.displayName,
          type: 'EAresSeasonType::Act',
          startsAt: act.startsAt,
          endsAt: act.endsAt,
          isActive: true,
          updatedAt: startedAt,
        },
      })

    const insertedRun = yield* db
      .insert(runs)
      .values({
        status: 'running',
        trigger: options.trigger,
        seasonId: act.uuid,
        clientVersion: version.riotClientVersion,
        startedAt,
        stats: {},
        updatedAt: startedAt,
      })
      .returning({ id: runs.id })
    const runId = insertedRun[0]?.id

    if (!runId) {
      return yield* new ScanFailedError({
        message: 'Could not create a run record.',
      })
    }

    const crawled = yield* Effect.forEach(
      regions,
      (region) => crawlRegion(options.session, version.riotClientVersion, act.uuid, region),
      { concurrency: 1 },
    ).pipe(
      Effect.catchTag('RiotRequestError', (error) =>
        Effect.gen(function* () {
          const now = nowDate(yield* Clock.currentTimeMillis)
          yield* db
            .update(runs)
            .set({
              status: 'failed',
              finishedAt: now,
              error: error.message,
              updatedAt: now,
            })
            .where(eq(runs.id, runId))

          return yield* error
        }),
      ),
    )

    const observed = new Map<string, ObservedPlayer>()

    for (const region of crawled) {
      for (const player of region.players) {
        const puuid = player.puuid
        if (!puuid) continue

        const existing = observed.get(puuid)

        if (existing) {
          existing.regions.add(region.region)
        } else {
          observed.set(puuid, { player, regions: new Set([region.region]) })
        }
      }
    }

    const names = yield* resolveNames(options.session, version.riotClientVersion, observed)
    const existingPlayers = yield* db
      .select({
        puuid: players.puuid,
        name: players.name,
        tag: players.tag,
        region: players.region,
        firstSeenAt: players.firstSeenAt,
        lastSeenAt: players.lastSeenAt,
        firstSeenRunId: players.firstSeenRunId,
        lastSeenRunId: players.lastSeenRunId,
        timesSeen: players.timesSeen,
        nameChanges: players.nameChanges,
        regionChanges: players.regionChanges,
        banCount: players.banCount,
        unbanCount: players.unbanCount,
        lastNameChangeAt: players.lastNameChangeAt,
        lastRegionChangeAt: players.lastRegionChangeAt,
        lastBanAt: players.lastBanAt,
        lastUnbanAt: players.lastUnbanAt,
      })
      .from(players)
    const existingByName = new Map(existingPlayers.map((player) => [player.puuid, player]))
    const openNames = yield* db
      .select({ id: playerNames.id, puuid: playerNames.puuid })
      .from(playerNames)
      .where(isNull(playerNames.endedAt))
    const openRegions = yield* db
      .select({ id: playerRegions.id, puuid: playerRegions.puuid })
      .from(playerRegions)
      .where(isNull(playerRegions.endedAt))
    const openBans = yield* db
      .select({ id: bannedPlayers.id, puuid: bannedPlayers.puuid })
      .from(bannedPlayers)
      .where(isNull(bannedPlayers.endedAt))
    const openNameByPuuid = new Map(openNames.map((row) => [row.puuid, row]))
    const openRegionByPuuid = new Map(openRegions.map((row) => [row.puuid, row]))
    const openBanByPuuid = new Map(openBans.map((row) => [row.puuid, row]))
    const observedAt = nowDate(yield* Clock.currentTimeMillis)
    const playerUpserts: Array<typeof players.$inferInsert> = []
    const seedUpserts: Array<typeof leaderboardSeeds.$inferInsert> = []
    const newNames: Array<typeof playerNames.$inferInsert> = []
    const newRegions: Array<typeof playerRegions.$inferInsert> = []
    const newBans: Array<typeof bannedPlayers.$inferInsert> = []
    const closeNames: Array<{ id: number; endedAt: Date; endedRunId: number | null }> = []
    const closeRegions: Array<{ id: number; endedAt: Date; endedRunId: number | null }> = []
    const closeBans: Array<{ id: number; endedAt: Date; endedRunId: number | null }> = []
    const banRefreshes: number[] = []
    let nameChanges = 0
    let regionChanges = 0
    let bans = 0
    let unbans = 0
    let unresolvedNames = 0

    for (const [puuid, entry] of observed) {
      const existing = existingByName.get(puuid)
      const resolvedName = names.get(puuid)
      const regionsClaimed = [...entry.regions]
      const unambiguousRegion = regionsClaimed.length === 1 ? regionsClaimed[0] : null
      const currentName = existing?.name ?? null
      const currentTag = existing?.tag ?? null
      const previousSeenAt = existing?.lastSeenAt ?? observedAt
      const previousRunId = existing?.lastSeenRunId ?? null
      const openName = openNameByPuuid.get(puuid)
      const openRegion = openRegionByPuuid.get(puuid)
      const openBan = openBanByPuuid.get(puuid)
      const isBanned = entry.player.IsBanned

      let nextName = currentName
      let nextTag = currentTag
      let nameChangesForPlayer = existing?.nameChanges ?? 0
      let lastNameChangeAt = existing?.lastNameChangeAt ?? null

      if (resolvedName) {
        if (currentName === null) {
          nextName = resolvedName.name
          nextTag = resolvedName.tag
          newNames.push({
            puuid,
            name: resolvedName.name,
            tag: resolvedName.tag,
            startedAt: observedAt,
            startedRunId: runId,
            updatedAt: observedAt,
          })
        } else if (resolvedName.name !== currentName || resolvedName.tag !== currentTag) {
          if (openName) {
            closeNames.push({
              id: openName.id,
              endedAt: previousSeenAt,
              endedRunId: previousRunId,
            })
          }

          nextName = resolvedName.name
          nextTag = resolvedName.tag
          nameChangesForPlayer += 1
          lastNameChangeAt = observedAt
          nameChanges += 1
          newNames.push({
            puuid,
            name: resolvedName.name,
            tag: resolvedName.tag,
            startedAt: observedAt,
            startedRunId: runId,
            updatedAt: observedAt,
          })
        }
      } else {
        unresolvedNames += 1
      }

      let nextRegion: Region | null = existing?.region ?? null
      let regionChangesForPlayer = existing?.regionChanges ?? 0
      let lastRegionChangeAt = existing?.lastRegionChangeAt ?? null

      if (unambiguousRegion) {
        if (nextRegion === null) {
          nextRegion = unambiguousRegion
          newRegions.push({
            puuid,
            region: unambiguousRegion,
            startedAt: observedAt,
            startedRunId: runId,
            updatedAt: observedAt,
          })
        } else if (nextRegion !== unambiguousRegion) {
          if (openRegion) {
            closeRegions.push({
              id: openRegion.id,
              endedAt: previousSeenAt,
              endedRunId: previousRunId,
            })
          }

          nextRegion = unambiguousRegion
          regionChangesForPlayer += 1
          lastRegionChangeAt = observedAt
          regionChanges += 1
          newRegions.push({
            puuid,
            region: unambiguousRegion,
            startedAt: observedAt,
            startedRunId: runId,
            updatedAt: observedAt,
          })
        } else if (!openRegion) {
          newRegions.push({
            puuid,
            region: unambiguousRegion,
            startedAt: observedAt,
            startedRunId: runId,
            updatedAt: observedAt,
          })
        }
      }

      if (unambiguousRegion) {
        seedUpserts.push({
          puuid,
          region: unambiguousRegion,
          seasonId: act.uuid,
          leaderboardRank: entry.player.leaderboardRank,
          rankedRating: entry.player.rankedRating,
          numberOfWins: entry.player.numberOfWins,
          competitiveTier: entry.player.competitiveTier,
          lastSeenAt: observedAt,
          updatedAt: observedAt,
        })
      }

      let banCount = existing?.banCount ?? 0
      let unbanCount = existing?.unbanCount ?? 0
      let lastBanAt = existing?.lastBanAt ?? null
      let lastUnbanAt = existing?.lastUnbanAt ?? null

      if (isBanned) {
        if (openBan) {
          banRefreshes.push(openBan.id)
        } else {
          newBans.push({
            puuid,
            startedAt: observedAt,
            lastSeenAt: observedAt,
            startedRunId: runId,
            updatedAt: observedAt,
          })
          banCount += 1
          lastBanAt = observedAt
          bans += 1
        }
      } else if (openBan) {
        closeBans.push({
          id: openBan.id,
          endedAt: previousSeenAt,
          endedRunId: previousRunId,
        })
        unbanCount += 1
        lastUnbanAt = observedAt
        unbans += 1
      }

      playerUpserts.push({
        puuid,
        name: nextName,
        tag: nextTag,
        cardId: entry.player.PlayerCardID,
        region: nextRegion,
        isBanned: isBanned,
        isAnonymized: false,
        firstSeenAt: existing?.firstSeenAt ?? observedAt,
        lastSeenAt: observedAt,
        firstSeenRunId: existing?.firstSeenRunId ?? runId,
        lastSeenRunId: runId,
        timesSeen: (existing?.timesSeen ?? 0) + 1,
        nameChanges: nameChangesForPlayer,
        regionChanges: regionChangesForPlayer,
        banCount,
        unbanCount,
        lastNameChangeAt,
        lastRegionChangeAt,
        lastBanAt,
        lastUnbanAt,
        updatedAt: observedAt,
      })
    }

    const anonymousByRegion = crawled.flatMap((region) =>
      region.anonymous.flatMap((player) => {
        const puuid = player.puuid && player.puuid.length > 0 ? lower(player.puuid) : null

        return [
          {
            region: region.region,
            seasonId: act.uuid,
            leaderboardRank: player.leaderboardRank,
            rankedRating: player.rankedRating,
            numberOfWins: player.numberOfWins,
            competitiveTier: player.competitiveTier,
            cardId: player.PlayerCardID,
            titleId: player.TitleID,
            puuid,
            status: 'unresolved' as const,
            firstSeenAt: observedAt,
            lastSeenAt: observedAt,
            updatedAt: observedAt,
          },
        ]
      }),
    )

    const finished = yield* Clock.currentTimeMillis
    const finishedAt = nowDate(finished)
    const pageOverlaps = crawled.reduce((sum, region) => sum + region.pageOverlaps, 0)
    const crossRegionOverlaps = [...observed.values()].filter(
      (entry) => entry.regions.size > 1,
    ).length
    const anonymized = crawled.reduce((sum, region) => sum + region.anonymized, 0)
    const bannedRows = crawled.reduce((sum, region) => sum + region.banned, 0)
    const stats = {
      players: observed.size,
      nameChanges,
      regionChanges,
      bans,
      unbans,
      pageOverlaps,
      crossRegionOverlaps,
      anonymized,
      unresolvedNames,
      bannedRows,
      regions: Object.fromEntries(
        crawled.map((region) => [
          region.region,
          {
            pages: region.pages,
            rows: region.rows,
            players: region.players.length,
            anonymized: region.anonymized,
            pageOverlaps: region.pageOverlaps,
            banned: region.banned,
          },
        ]),
      ),
    }

    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        for (const batch of chunks(playerUpserts, 250)) {
          yield* tx
            .insert(players)
            .values(batch)
            .onConflictDoUpdate({
              target: players.puuid,
              set: {
                name: sql`excluded.name`,
                tag: sql`excluded.tag`,
                cardId: sql`excluded.card_id`,
                region: sql`excluded.region`,
                isBanned: sql`excluded.is_banned`,
                isAnonymized: sql`excluded.is_anonymized`,
                firstSeenAt: sql`excluded.first_seen_at`,
                lastSeenAt: sql`excluded.last_seen_at`,
                firstSeenRunId: sql`excluded.first_seen_run_id`,
                lastSeenRunId: sql`excluded.last_seen_run_id`,
                timesSeen: sql`excluded.times_seen`,
                nameChanges: sql`excluded.name_changes`,
                regionChanges: sql`excluded.region_changes`,
                banCount: sql`excluded.ban_count`,
                unbanCount: sql`excluded.unban_count`,
                lastNameChangeAt: sql`excluded.last_name_change_at`,
                lastRegionChangeAt: sql`excluded.last_region_change_at`,
                lastBanAt: sql`excluded.last_ban_at`,
                lastUnbanAt: sql`excluded.last_unban_at`,
                updatedAt: sql`excluded.updated_at`,
              },
            })
        }

        for (const batch of chunks(seedUpserts, 250)) {
          yield* tx
            .insert(leaderboardSeeds)
            .values(batch)
            .onConflictDoUpdate({
              target: leaderboardSeeds.puuid,
              set: {
                region: sql`excluded.region`,
                seasonId: sql`excluded.season_id`,
                leaderboardRank: sql`excluded.leaderboard_rank`,
                rankedRating: sql`excluded.ranked_rating`,
                numberOfWins: sql`excluded.number_of_wins`,
                competitiveTier: sql`excluded.competitive_tier`,
                lastSeenAt: sql`excluded.last_seen_at`,
                updatedAt: sql`excluded.updated_at`,
              },
            })
        }

        for (const interval of closeNames) {
          yield* tx
            .update(playerNames)
            .set({
              endedAt: interval.endedAt,
              endedRunId: interval.endedRunId,
              updatedAt: observedAt,
            })
            .where(eq(playerNames.id, interval.id))
        }

        for (const batch of chunks(newNames, 500)) {
          yield* tx.insert(playerNames).values(batch)
        }

        for (const interval of closeRegions) {
          yield* tx
            .update(playerRegions)
            .set({
              endedAt: interval.endedAt,
              endedRunId: interval.endedRunId,
              updatedAt: observedAt,
            })
            .where(eq(playerRegions.id, interval.id))
        }

        for (const batch of chunks(newRegions, 500)) {
          yield* tx.insert(playerRegions).values(batch)
        }

        for (const interval of closeBans) {
          yield* tx
            .update(bannedPlayers)
            .set({
              endedAt: interval.endedAt,
              endedRunId: interval.endedRunId,
              updatedAt: observedAt,
            })
            .where(eq(bannedPlayers.id, interval.id))
        }

        for (const id of banRefreshes) {
          yield* tx
            .update(bannedPlayers)
            .set({ lastSeenAt: observedAt, updatedAt: observedAt })
            .where(eq(bannedPlayers.id, id))
        }

        for (const batch of chunks(newBans, 500)) {
          yield* tx.insert(bannedPlayers).values(batch)
        }

        for (const batch of chunks(anonymousByRegion, 100)) {
          yield* tx
            .insert(anonymousRows)
            .values(batch)
            .onConflictDoUpdate({
              target: [anonymousRows.region, anonymousRows.seasonId, anonymousRows.leaderboardRank],
              set: {
                rankedRating: sql`excluded.ranked_rating`,
                numberOfWins: sql`excluded.number_of_wins`,
                competitiveTier: sql`excluded.competitive_tier`,
                cardId: sql`excluded.card_id`,
                titleId: sql`excluded.title_id`,
                lastSeenAt: sql`excluded.last_seen_at`,
                updatedAt: sql`excluded.updated_at`,
              },
            })
        }

        const linkedRows = yield* tx
          .select({ puuid: anonymousRows.resolvedPuuid, cardId: anonymousRows.cardId })
          .from(anonymousRows)
          .where(and(eq(anonymousRows.status, 'linked'), eq(anonymousRows.lastSeenAt, observedAt)))
        const linkedPuuids = [
          ...new Set(linkedRows.flatMap((row) => (row.puuid ? [row.puuid] : []))),
        ]

        for (const batch of chunks(linkedPuuids, 200)) {
          yield* tx
            .update(players)
            .set({
              lastSeenAt: observedAt,
              timesSeen: sql`${players.timesSeen} + 1`,
              updatedAt: observedAt,
            })
            .where(inArray(players.puuid, batch))
        }

        for (const row of linkedRows) {
          if (!row.puuid || !row.cardId) continue
          yield* tx
            .update(players)
            .set({ cardId: row.cardId, updatedAt: observedAt })
            .where(eq(players.puuid, row.puuid))
        }

        yield* tx.delete(anonymousRows).where(
          and(
            eq(anonymousRows.status, 'unresolved'),
            eq(anonymousRows.seasonId, act.uuid),
            inArray(
              anonymousRows.region,
              crawled.map((region) => region.region),
            ),
            lt(anonymousRows.lastSeenAt, observedAt),
          ),
        )

        for (const region of crawled) {
          yield* tx
            .insert(runRegions)
            .values({
              runId,
              region: region.region,
              status: 'succeeded',
              pages: region.pages,
              players: region.players.length,
              pageOverlaps: region.pageOverlaps,
              crossRegionOverlaps,
              staleNames: 0,
              unresolvedNames,
              banned: region.banned,
              anonymized: region.anonymized,
              stats: {
                rows: region.rows,
                unique: region.players.length,
                anonymized: region.anonymized,
              },
              updatedAt: observedAt,
            })
            .onConflictDoUpdate({
              target: [runRegions.runId, runRegions.region],
              set: {
                status: 'succeeded',
                pages: region.pages,
                players: region.players.length,
                pageOverlaps: region.pageOverlaps,
                crossRegionOverlaps,
                unresolvedNames,
                banned: region.banned,
                anonymized: region.anonymized,
                updatedAt: observedAt,
              },
            })
        }

        yield* tx
          .update(runs)
          .set({
            status: 'succeeded',
            finishedAt,
            durationMs: finished - started,
            stats,
            updatedAt: finishedAt,
          })
          .where(eq(runs.id, runId))

        yield* tx
          .insert(meta)
          .values([
            { key: 'latestSuccessfulRunId', value: String(runId), updatedAt: finishedAt },
            { key: 'indexVersion', value: '1', updatedAt: finishedAt },
          ])
          .onConflictDoUpdate({
            target: meta.key,
            set: {
              value: sql`case when ${meta.key} = 'indexVersion' then cast(${meta.value} as integer) + 1 else excluded.value end`,
              updatedAt: finishedAt,
            },
          })
      }),
    )

    return {
      runId,
      players: observed.size,
      nameChanges,
      regionChanges,
      bans,
      unbans,
      anonymous: anonymousByRegion.length,
      pageOverlaps,
      crossRegionOverlaps,
      unresolvedNames,
    }
  })
