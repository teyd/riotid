// @effect-diagnostics globalJsonInEffect:off
import { Database } from '@riotid/db'
import type {
  CrawlerSnapshot,
  IndexPlayer,
  PlayerDetail,
  Region,
  ServiceStatus,
  SiteIndex,
  SiteStats,
} from '@riotid/contracts'
import { Schema } from 'effect'

const NameIntervalType = Schema.Struct({
  name: Schema.String,
  tag: Schema.String,
  startedAt: Schema.Finite,
  endedAt: Schema.NullOr(Schema.Finite),
  startedRunId: Schema.NullOr(Schema.Finite),
  endedRunId: Schema.NullOr(Schema.Finite),
})
const RegionIntervalType = Schema.Struct({
  region: Schema.Literals(['na', 'eu', 'ap', 'kr']),
  startedAt: Schema.Finite,
  endedAt: Schema.NullOr(Schema.Finite),
  startedRunId: Schema.NullOr(Schema.Finite),
  endedRunId: Schema.NullOr(Schema.Finite),
})
const BanIntervalType = Schema.Struct({
  startedAt: Schema.Finite,
  endedAt: Schema.NullOr(Schema.Finite),
  lastSeenAt: Schema.Finite,
  startedRunId: Schema.NullOr(Schema.Finite),
  endedRunId: Schema.NullOr(Schema.Finite),
})
type NameIntervalType = typeof NameIntervalType.Type
type RegionIntervalType = typeof RegionIntervalType.Type
type BanIntervalType = typeof BanIntervalType.Type
import { sql } from 'drizzle-orm'
import { Effect } from 'effect'

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
      order by last_seen_at desc, puuid
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

    const nameTimeline: NameIntervalType[] = names.map((row) => ({
      name: row.name,
      tag: row.tag,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      startedRunId: row.started_run_id,
      endedRunId: row.ended_run_id,
    }))
    const regionTimeline: RegionIntervalType[] = regions.map((row) => ({
      region: row.region,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      startedRunId: row.started_run_id,
      endedRunId: row.ended_run_id,
    }))
    const banTimeline: BanIntervalType[] = bans.map((row) => ({
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

export const buildSiteStats: Effect.Effect<SiteStats, unknown, Database> = Effect.gen(function* () {
  const db = yield* Database
  const totals = yield* db.get<{
    players: number
    banned: number
    anonymized: number
    name_changes: number
    region_changes: number
    bans: number
    unbans: number
    runs: number
  }>(sql`
      select
        (select count(*) from players) as players,
        (select count(*) from players where is_banned = 1) as banned,
        (select count(*) from players where is_anonymized = 1) as anonymized,
        (select coalesce(sum(name_changes), 0) from players) as name_changes,
        (select coalesce(sum(region_changes), 0) from players) as region_changes,
        (select coalesce(sum(ban_count), 0) from players) as bans,
        (select coalesce(sum(unban_count), 0) from players) as unbans,
        (select count(*) from runs) as runs
    `)
  const anonymous = yield* db.get<{ linked: number; unresolved: number }>(sql`
      select
        coalesce(sum(case when status = 'linked' then 1 else 0 end), 0) as linked,
        coalesce(sum(case when status = 'unresolved' then 1 else 0 end), 0) as unresolved
      from anonymous_rows
    `)
  const regionTotals = yield* db.all<{ region: Region; players: number; banned: number }>(sql`
      select region, count(*) as players, sum(case when is_banned = 1 then 1 else 0 end) as banned
      from players where region is not null
      group by region
    `)
  const regionAnonymous = yield* db.all<{
    region: Region
    linked: number
    unresolved: number
  }>(sql`
      select
        region,
        sum(case when status = 'linked' then 1 else 0 end) as linked,
        sum(case when status = 'unresolved' then 1 else 0 end) as unresolved
      from anonymous_rows
      group by region
    `)
  const seedTotals = yield* db.all<{
    region: Region
    players: number
    average_rating: number
    top_rating: number
    total_wins: number
  }>(sql`
      select
        region,
        count(*) as players,
        avg(ranked_rating) as average_rating,
        max(ranked_rating) as top_rating,
        coalesce(sum(number_of_wins), 0) as total_wins
      from leaderboard_seeds
      group by region
    `)
  const ratings = yield* db.all<{ region: Region; ranked_rating: number }>(sql`
      select region, ranked_rating from leaderboard_seeds order by region, ranked_rating asc
    `)
  const tiers = yield* db.all<{ region: Region; competitive_tier: number; total: number }>(sql`
      select region, competitive_tier, count(*) as total
      from leaderboard_seeds
      group by region, competitive_tier
    `)
  const recentNames = yield* db.all<{
    puuid: string
    name: string
    tag: string
    ended_at: number
  }>(sql`
      select puuid, name, tag, ended_at from player_names
      where ended_at is not null
      order by ended_at desc, id desc
      limit 20
    `)
  const recentRegions = yield* db.all<{
    puuid: string
    name: string | null
    tag: string | null
    region: Region
    ended_at: number
  }>(sql`
      select r.puuid, p.name, p.tag, r.region, r.ended_at
      from player_regions r left join players p on p.puuid = r.puuid
      where r.ended_at is not null
      order by r.ended_at desc, r.id desc
      limit 20
    `)
  const recentBans = yield* db.all<{
    puuid: string
    name: string | null
    tag: string | null
    ended_at: number
  }>(sql`
      select b.puuid, p.name, p.tag, b.ended_at
      from banned_players b left join players p on p.puuid = b.puuid
      where b.ended_at is not null
      order by b.ended_at desc, b.id desc
      limit 20
    `)
  const runRows = yield* db.all<{ finished_at: number; stats: string }>(sql`
      select finished_at, stats from runs
      where status = 'succeeded' and finished_at is not null
      order by finished_at desc
      limit 30
    `)
  const mostChanged = yield* db.all<{
    puuid: string
    name: string | null
    tag: string | null
    region: Region | null
    name_changes: number
    region_changes: number
  }>(sql`
      select puuid, name, tag, region, name_changes, region_changes
      from players
      where name_changes > 0 or region_changes > 0
      order by (name_changes + region_changes) desc, last_seen_at desc
      limit 20
    `)

  const ratingsByRegion = new Map<Region, number[]>()
  for (const row of ratings) {
    const list = ratingsByRegion.get(row.region) ?? []
    list.push(row.ranked_rating)
    ratingsByRegion.set(row.region, list)
  }

  const linked = anonymous?.linked ?? 0
  const unresolved = anonymous?.unresolved ?? 0

  return {
    totals: {
      players: totals?.players ?? 0,
      banned: totals?.banned ?? 0,
      anonymized: totals?.anonymized ?? 0,
      linked,
      unresolved,
      nameChanges: totals?.name_changes ?? 0,
      regionChanges: totals?.region_changes ?? 0,
      bans: totals?.bans ?? 0,
      unbans: totals?.unbans ?? 0,
      runs: totals?.runs ?? 0,
    },
    coverage: {
      linked,
      unresolved,
      ratio: linked + unresolved > 0 ? linked / (linked + unresolved) : 1,
    },
    regions: Object.fromEntries(
      regionTotals.map((row) => {
        const values = ratingsByRegion.get(row.region) ?? []
        const anonymousRow = regionAnonymous.find((item) => item.region === row.region)
        const summary = seedTotals.find((item) => item.region === row.region)

        return [
          row.region,
          {
            players: row.players,
            banned: row.banned,
            linked: anonymousRow?.linked ?? 0,
            unresolved: anonymousRow?.unresolved ?? 0,
            averageRating: Math.round(summary?.average_rating ?? 0),
            medianRating: values.length > 0 ? (values[Math.floor(values.length / 2)] ?? 0) : 0,
            topRating: summary?.top_rating ?? 0,
            totalWins: summary?.total_wins ?? 0,
            tiers: Object.fromEntries(
              tiers
                .filter((tier) => tier.region === row.region)
                .map((tier) => [String(tier.competitive_tier), tier.total]),
            ),
          },
        ]
      }),
    ),
    recent: {
      names: recentNames.map((row) => ({
        puuid: row.puuid,
        name: row.name,
        tag: row.tag,
        endedAt: row.ended_at,
      })),
      regions: recentRegions.map((row) => ({
        puuid: row.puuid,
        name: row.name,
        tag: row.tag,
        region: row.region,
        endedAt: row.ended_at,
      })),
      bans: recentBans.map((row) => ({
        puuid: row.puuid,
        name: row.name,
        tag: row.tag,
        endedAt: row.ended_at,
      })),
    },
    history: runRows
      .map((row) => {
        const stats = parseEvidence(row.stats)
        const value = (key: string) => (typeof stats[key] === 'number' ? (stats[key] as number) : 0)

        return {
          at: row.finished_at,
          players: value('players'),
          nameChanges: value('nameChanges'),
          regionChanges: value('regionChanges'),
          bans: value('bans'),
          unbans: value('unbans'),
          anonymous: value('anonymized'),
        }
      })
      .reverse(),
    mostChanged: mostChanged.map((row) => ({
      puuid: row.puuid,
      name: row.name,
      tag: row.tag,
      region: row.region,
      nameChanges: row.name_changes,
      regionChanges: row.region_changes,
    })),
  }
})

export const buildServiceStatus = (options: {
  readonly databasePath: string
  readonly cookieFile: string
  readonly cookieUpdatedAt: number | null
  readonly uptimeSeconds: number
}): Effect.Effect<ServiceStatus, unknown, Database> =>
  Effect.gen(function* () {
    const db = yield* Database
    const ping = yield* db.get<{ ok: number }>(sql`select 1 as ok`)
    const version = yield* readIndexVersion
    const players = yield* db.get<{ total: number }>(
      sql`select count(*) as total from players where is_banned = 0`,
    )
    const season = yield* db.get<{ uuid: string; display_name: string; ends_at: number }>(sql`
      select uuid, display_name, ends_at from seasons
      where is_active = 1 order by ends_at desc limit 1
    `)
    const latestRun = yield* db.get<{
      id: number
      status: string
      trigger: string
      finished_at: number | null
      duration_ms: number | null
    }>(sql`
      select id, status, trigger, finished_at, duration_ms
      from runs order by id desc limit 1
    `)
    const recentRuns = yield* db.all<{
      id: number
      status: string
      trigger: string
      started_at: number
      finished_at: number | null
      duration_ms: number | null
    }>(sql`
      select id, status, trigger, started_at, finished_at, duration_ms
      from runs order by id desc limit 12
    `)
    const anonymous = yield* db.get<{ total: number; unresolved: number; linked: number }>(sql`
      select
        count(*) as total,
        coalesce(sum(case when status = 'unresolved' then 1 else 0 end), 0) as unresolved,
        coalesce(sum(case when status = 'linked' then 1 else 0 end), 0) as linked
      from anonymous_rows
    `)
    const metaRows = yield* db.all<{ key: string; value: string }>(sql`
      select key, value from meta
      where key in ('lastBackupAt', 'anon:lastRunAt')
    `)
    const metaValues = new Map(metaRows.map((row) => [row.key, row.value]))
    const backupAt = metaValues.get('lastBackupAt')
    const anonRunAt = metaValues.get('anon:lastRunAt')
    const databaseOk = ping?.ok === 1

    return {
      ok: databaseOk,
      uptimeSeconds: options.uptimeSeconds,
      database: { ok: databaseOk, path: options.databasePath },
      index: { version, players: players?.total ?? 0 },
      season: season
        ? { id: season.uuid, name: season.display_name, endsAt: season.ends_at }
        : null,
      latestRun: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            trigger: latestRun.trigger,
            finishedAt: latestRun.finished_at,
            durationMs: latestRun.duration_ms,
          }
        : null,
      recentRuns: recentRuns.map((run) => ({
        id: run.id,
        status: run.status,
        trigger: run.trigger,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
        durationMs: run.duration_ms,
      })),
      auth: { cookieFile: options.cookieFile, updatedAt: options.cookieUpdatedAt },
      anonymous: {
        total: anonymous?.total ?? 0,
        unresolved: anonymous?.unresolved ?? 0,
        linked: anonymous?.linked ?? 0,
      },
      lastBackupAt: backupAt ? Date.parse(backupAt) : null,
      lastAnonRunAt: anonRunAt ? Date.parse(anonRunAt) : null,
    }
  })

export const crawlerSnapshot = (
  now = Date.now(),
): Effect.Effect<CrawlerSnapshot, unknown, Database> =>
  Effect.gen(function* () {
    const db = yield* Database
    const today = new Date(now).toISOString().slice(0, 10)
    const lastRun = yield* db.get<{ value: string }>(
      sql`select value from meta where key = 'anon:lastRunAt'`,
    )
    const runningSince = yield* db.get<{ value: string }>(
      sql`select value from meta where key = 'anon:runningSince'`,
    )
    const requests = yield* db.get<{ value: string }>(
      sql`select value from meta where key = ${`anon:requests:${today}`}`,
    )
    const progress = yield* db.get<{ value: string }>(
      sql`select value from meta where key = 'anon:progress'`,
    )
    const nextRun = yield* db.get<{ value: string }>(
      sql`select value from meta where key = 'anon:nextRunAt'`,
    )
    const nextMessage = yield* db.get<{ value: string }>(
      sql`select value from meta where key = 'anon:nextMessage'`,
    )
    const cache = yield* db.get<{ rows: number; matches: number }>(sql`
      select count(*) as rows, count(distinct match_id) as matches from match_candidates
    `)
    const regionRows = yield* db.all<{ region: Region; matches: number }>(sql`
      select region, count(distinct match_id) as matches
      from match_candidates group by region
    `)
    const byRegion: Record<string, number> = { na: 0, eu: 0, ap: 0, kr: 0 }

    for (const row of regionRows) {
      byRegion[row.region] = row.matches
    }
    const matches = yield* db.all<{
      match_id: string
      region: Region
      participants: number
      game_start_at: number
      discovered_at: number
    }>(sql`
      select
        match_id,
        region,
        count(*) as participants,
        min(game_start_at) as game_start_at,
        max(created_at) as discovered_at
      from match_candidates
      group by match_id, region
      order by discovered_at desc
      limit 80
    `)
    const since = Number(runningSince?.value ?? '0')
    const raw = progress ? parseEvidence(progress.value) : {}
    const number = (key: string) => (typeof raw[key] === 'number' ? raw[key] : 0)
    const activity =
      typeof raw.phase === 'string' && typeof raw.message === 'string'
        ? {
            phase: raw.phase,
            message: raw.message,
            region: typeof raw.region === 'string' ? (raw.region as Region) : null,
            startedAt: number('startedAt'),
            seedsDone: number('seedsDone'),
            seedsTotal: number('seedsTotal'),
            matchesFetched: number('matchesFetched'),
            requests: number('requests'),
            budget: number('budget'),
            linked: number('linked'),
            ambiguous: number('ambiguous'),
            tried: number('tried'),
            limit: number('limit'),
            currentMatchId: typeof raw.currentMatchId === 'string' ? raw.currentMatchId : null,
            updatedAt: number('updatedAt'),
          }
        : null

    return {
      running: since > 0 && now - since < 15 * 60_000,
      lastRunAt: lastRun ? Date.parse(lastRun.value) : null,
      requestsToday: Number(requests?.value ?? '0') || 0,
      cache: { matches: cache?.matches ?? 0, rows: cache?.rows ?? 0, byRegion },
      schedule: {
        nextRunAt: nextRun ? Number(nextRun.value) || null : null,
        message: nextMessage?.value ?? null,
      },
      activity,
      matches: matches.map((row) => ({
        matchId: row.match_id,
        region: row.region,
        participants: row.participants,
        gameStartAt: row.game_start_at,
        discoveredAt: row.discovered_at,
      })),
    }
  })
