// @effect-diagnostics globalJsonInEffect:off
import type {
  BanInterval,
  IndexPlayer,
  NameInterval,
  PlayerDetail,
  Region,
  RegionInterval,
  SiteIndex,
} from '@riotid/contracts'
import { sql } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database } from './client.ts'

const dayMs = 86_400_000

type PlayerRow = {
  puuid: string
  name: string | null
  tag: string | null
  card_id: string | null
  region: Region | null
  is_anonymized: number
  name_changes: number
  region_changes: number
  ban_count: number
  unban_count: number
  first_seen_at: number
  last_seen_at: number
  last_name_change_at: number | null
  last_region_change_at: number | null
}

export const readIndexVersion: Effect.Effect<number, unknown, Database> = Effect.gen(function* () {
  const db = yield* Database
  const row = yield* db.get<{ value: string }>(
    sql`select value from meta where key = 'indexVersion'`,
  )
  return Number(row?.value ?? '0')
})

export const buildSiteIndex = (
  now = Date.now(),
  indexWindowDays = 30,
): Effect.Effect<SiteIndex, unknown, Database> =>
  Effect.gen(function* () {
    const db = yield* Database
    const version = yield* readIndexVersion
    const cutoff = now - indexWindowDays * dayMs
    const season = yield* db.get<{ uuid: string; display_name: string; ends_at: number }>(sql`
      select uuid, display_name, ends_at from seasons
      where is_active = 1
      order by ends_at desc
      limit 1
    `)
    const totals = yield* db.get<{
      players: number
      name_changes: number
      region_changes: number
      bans: number
      unbans: number
    }>(sql`
      select
        count(*) as players,
        coalesce(sum(name_changes), 0) as name_changes,
        coalesce(sum(region_changes), 0) as region_changes,
        coalesce(sum(ban_count), 0) as bans,
        coalesce(sum(unban_count), 0) as unbans
      from players
    `)
    const anonymous = yield* db.get<{ total: number; linked: number; unresolved: number }>(sql`
      select
        count(*) as total,
        coalesce(sum(case when status = 'linked' then 1 else 0 end), 0) as linked,
        coalesce(sum(case when status = 'unresolved' then 1 else 0 end), 0) as unresolved
      from anonymous_rows
    `)
    const latestRun = yield* db.get<{ finished_at: number | null }>(sql`
      select finished_at from runs where status = 'succeeded' order by finished_at desc limit 1
    `)
    const rows = yield* db.all<PlayerRow>(sql`
      select
        puuid, name, tag, card_id, region, is_anonymized,
        name_changes, region_changes, ban_count, unban_count,
        first_seen_at, last_seen_at, last_name_change_at, last_region_change_at
      from players
      where is_banned = 0 and last_seen_at >= ${cutoff}
      order by last_seen_at desc, puuid desc
    `)

    const cards: string[] = []
    const cardIndexes = new Map<string, number>()

    for (const row of rows) {
      if (row.card_id && !cardIndexes.has(row.card_id)) {
        cardIndexes.set(row.card_id, cards.length)
        cards.push(row.card_id)
      }
    }

    const players: IndexPlayer[] = rows.map((row) => {
      let flags = 0
      if (row.is_anonymized) flags |= 1
      if (row.name_changes > 0) flags |= 2
      if (row.region_changes > 0) flags |= 4
      if (row.ban_count > 0) flags |= 8
      if (row.unban_count > 0) flags |= 16

      return [
        row.puuid,
        row.name ?? '',
        row.tag ?? '',
        row.region,
        flags,
        row.name_changes,
        row.region_changes,
        row.first_seen_at,
        row.last_seen_at,
        row.card_id ? (cardIndexes.get(row.card_id) ?? null) : null,
        row.last_name_change_at,
      ]
    })

    return {
      version,
      generatedAt: now,
      season: season
        ? { id: season.uuid, name: season.display_name, endsAt: season.ends_at }
        : null,
      stats: {
        players: totals?.players ?? 0,
        nameChanges: totals?.name_changes ?? 0,
        regionChanges: totals?.region_changes ?? 0,
        bans: totals?.bans ?? 0,
        unbans: totals?.unbans ?? 0,
        anonymous: anonymous?.total ?? 0,
        linked: anonymous?.linked ?? 0,
        unresolved: anonymous?.unresolved ?? 0,
        lastRunAt: latestRun?.finished_at ?? null,
      },
      cards,
      players,
    }
  })

export const loadPlayerDetail = (
  puuid: string,
): Effect.Effect<PlayerDetail | null, unknown, Database> =>
  Effect.gen(function* () {
    const db = yield* Database
    const player = yield* db.get<{
      puuid: string
      name: string | null
      tag: string | null
      card_id: string | null
      region: Region | null
      is_banned: number
      is_anonymized: number
      first_seen_at: number
      last_seen_at: number
      first_seen_run_id: number | null
      last_seen_run_id: number | null
      times_seen: number
      name_changes: number
      region_changes: number
      ban_count: number
      unban_count: number
      last_name_change_at: number | null
      last_region_change_at: number | null
      last_ban_at: number | null
      last_unban_at: number | null
    }>(sql`
      select * from players where puuid = ${puuid}
    `)

    if (!player) return null

    const names = yield* db.all<{
      name: string
      tag: string
      started_at: number
      ended_at: number | null
      started_run_id: number | null
      ended_run_id: number | null
    }>(sql`
      select name, tag, started_at, ended_at, started_run_id, ended_run_id
      from player_names where puuid = ${puuid}
      order by started_at asc, id asc
    `)
    const regions = yield* db.all<{
      region: Region
      started_at: number
      ended_at: number | null
      started_run_id: number | null
      ended_run_id: number | null
    }>(sql`
      select region, started_at, ended_at, started_run_id, ended_run_id
      from player_regions where puuid = ${puuid}
      order by started_at asc, id asc
    `)
    const bans = yield* db.all<{
      started_at: number
      ended_at: number | null
      last_seen_at: number
      started_run_id: number | null
      ended_run_id: number | null
    }>(sql`
      select started_at, ended_at, last_seen_at, started_run_id, ended_run_id
      from banned_players where puuid = ${puuid}
      order by started_at asc, id asc
    `)
    const links = yield* db.all<{
      match_id: string | null
      method: 'direct_puuid' | 'mmr_fingerprint' | 'match_graph'
      confidence: number
      evidence: string
      created_at: number
      region: Region
      leaderboard_rank: number
      ranked_rating: number
      number_of_wins: number
      competitive_tier: number
      card_id: string
      title_id: string
      season_id: string
      season_name: string | null
    }>(sql`
      select
        l.match_id, l.method, l.confidence, l.evidence, l.created_at, l.season_id,
        s.display_name as season_name,
        a.region, a.leaderboard_rank, a.ranked_rating, a.number_of_wins,
        a.competitive_tier, a.card_id, a.title_id
      from identity_links l
      join anonymous_rows a on a.id = l.anonymous_row_id
      left join seasons s on s.uuid = l.season_id
      where l.puuid = ${puuid}
      order by l.created_at asc, l.id asc
    `)

    const nameTimeline: NameInterval[] = names.map((row) => ({
      name: row.name,
      tag: row.tag,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      startedRunId: row.started_run_id,
      endedRunId: row.ended_run_id,
    }))
    const regionTimeline: RegionInterval[] = regions.map((row) => ({
      region: row.region,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      startedRunId: row.started_run_id,
      endedRunId: row.ended_run_id,
    }))
    const banTimeline: BanInterval[] = bans.map((row) => ({
      startedAt: row.started_at,
      endedAt: row.ended_at,
      lastSeenAt: row.last_seen_at,
      startedRunId: row.started_run_id,
      endedRunId: row.ended_run_id,
    }))

    return {
      player: {
        puuid: player.puuid,
        name: player.name,
        tag: player.tag,
        cardId: player.card_id,
        region: player.region,
        isBanned: player.is_banned === 1,
        isAnonymized: player.is_anonymized === 1,
        firstSeenAt: player.first_seen_at,
        lastSeenAt: player.last_seen_at,
        firstSeenRunId: player.first_seen_run_id,
        lastSeenRunId: player.last_seen_run_id,
        timesSeen: player.times_seen,
        nameChanges: player.name_changes,
        regionChanges: player.region_changes,
        banCount: player.ban_count,
        unbanCount: player.unban_count,
        lastNameChangeAt: player.last_name_change_at,
        lastRegionChangeAt: player.last_region_change_at,
        lastBanAt: player.last_ban_at,
        lastUnbanAt: player.last_unban_at,
      },
      names: nameTimeline,
      regions: regionTimeline,
      bans: banTimeline,
      links: links.map((row) => ({
        matchId: row.match_id,
        method: row.method,
        confidence: row.confidence,
        evidence: parseEvidence(row.evidence),
        createdAt: row.created_at,
        anonymous: {
          region: row.region,
          leaderboardRank: row.leaderboard_rank,
          rankedRating: row.ranked_rating,
          numberOfWins: row.number_of_wins,
          competitiveTier: row.competitive_tier,
          seasonId: row.season_id,
          seasonName: row.season_name,
          cardId: row.card_id,
          titleId: row.title_id,
        },
      })),
    }
  })

const parseEvidence = (raw: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
