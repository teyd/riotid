// @effect-diagnostics globalJsonInEffect:off
import type {
  BanInterval,
  IndexPlayer,
  NameInterval,
  PlayerDetail,
  PlayerPage,
  PlayerSearch,
  PlayerSort,
  Region,
  RegionInterval,
  SearchMatch,
  SearchPlayer,
  SiteIndex,
  SiteOverview,
} from '@riotid/contracts'
import { sql } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database } from './client.ts'

const dayMs = 86_400_000
const hourMs = 3_600_000
export const defaultIndexPlayerLimit = 50_000

type PlayerSummaryRow = {
  puuid: string
  name: string | null
  tag: string | null
  card_id: string | null
  region: Region | null
  name_changes: number
  region_changes: number
  first_seen_at: number
  last_seen_at: number
}

type PlayerRow = PlayerSummaryRow & {
  is_anonymized: number
  ban_count: number
  unban_count: number
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

const readSiteOverview = (
  now: number,
  indexWindowDays: number,
  scanIntervalHours: number,
): Effect.Effect<SiteOverview, unknown, Database> =>
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
    const publicTotals = yield* db.get<{ total: number }>(sql`
      select count(*) as total
      from players
      where is_banned = 0 and last_seen_at >= ${cutoff}
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

    return {
      version,
      generatedAt: now,
      season: season
        ? { id: season.uuid, name: season.display_name, endsAt: season.ends_at }
        : null,
      stats: {
        players: totals?.players ?? 0,
        publicPlayers: publicTotals?.total ?? 0,
        nameChanges: totals?.name_changes ?? 0,
        regionChanges: totals?.region_changes ?? 0,
        bans: totals?.bans ?? 0,
        unbans: totals?.unbans ?? 0,
        anonymous: anonymous?.total ?? 0,
        linked: anonymous?.linked ?? 0,
        unresolved: anonymous?.unresolved ?? 0,
        lastRunAt: latestRun?.finished_at ?? null,
        nextRunAt: latestRun?.finished_at
          ? latestRun.finished_at + scanIntervalHours * hourMs
          : null,
      },
    }
  })

export const buildSiteOverview = (
  now = Date.now(),
  indexWindowDays = 30,
  scanIntervalHours = 6,
): Effect.Effect<SiteOverview, unknown, Database> =>
  readSiteOverview(now, indexWindowDays, scanIntervalHours)

export const buildSiteIndex = (
  now = Date.now(),
  indexWindowDays = 30,
  scanIntervalHours = 6,
  playerLimit = defaultIndexPlayerLimit,
): Effect.Effect<SiteIndex, unknown, Database> =>
  Effect.gen(function* () {
    const db = yield* Database
    const overview = yield* readSiteOverview(now, indexWindowDays, scanIntervalHours)
    const cutoff = now - indexWindowDays * dayMs
    const rows = yield* db.all<PlayerRow>(sql`
      select
        puuid, name, tag, card_id, region, is_anonymized,
        name_changes, region_changes, ban_count, unban_count,
        first_seen_at, last_seen_at, last_name_change_at, last_region_change_at
      from players
      where is_banned = 0 and last_seen_at >= ${cutoff}
      order by last_seen_at desc, puuid desc
      limit ${playerLimit + 1}
    `)

    const visibleRows = rows.slice(0, playerLimit)
    const cards: string[] = []
    const cardIndexes = new Map<string, number>()

    for (const row of visibleRows) {
      if (row.card_id && !cardIndexes.has(row.card_id)) {
        cardIndexes.set(row.card_id, cards.length)
        cards.push(row.card_id)
      }
    }

    const players: IndexPlayer[] = visibleRows.map((row) => {
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

    return { ...overview, cards, players }
  })

export const searchMinQueryLength = 3
export const searchDefaultLimit = 20
export const searchMaxLimit = 50
const searchCandidateLimit = 100

export type SearchOptions = {
  readonly region?: Region | null
  readonly limit?: number
  readonly now?: number
  readonly indexWindowDays?: number
}

type SearchRow = PlayerSummaryRow & {
  match_name: string
  match_tag: string
  started_at: number | null
  ended_at: number | null
}

type SearchCandidate = {
  readonly player: SearchPlayer
  readonly matchName: string
  readonly matchTag: string
  readonly startedAt: number | null
  readonly endedAt: number | null
  readonly bucket: number
}

const emptySearch = (query: string, limit: number): PlayerSearch => ({
  query,
  minQueryLength: searchMinQueryLength,
  limit,
  current: { total: 0, truncated: false, players: [] },
  past: { total: 0, truncated: false, matches: [] },
})

const toSearchPlayer = (row: PlayerSummaryRow): SearchPlayer => ({
  puuid: row.puuid,
  name: row.name ?? '',
  tag: row.tag ?? '',
  region: row.region,
  cardId: row.card_id,
  nameChanges: row.name_changes,
  regionChanges: row.region_changes,
  firstSeenAt: row.first_seen_at,
  lastSeenAt: row.last_seen_at,
})

const matchBucket = (name: string, tag: string, needle: string): number => {
  const foldedName = name.toLowerCase()
  const foldedTag = tag.toLowerCase()
  const combined = `${foldedName}#${foldedTag}`

  if (combined === needle) return 0
  if (foldedName === needle) return 1
  if (foldedTag === needle) return 2
  if (combined.startsWith(needle)) return 3
  if (foldedName.startsWith(needle)) return 4
  if (foldedTag.startsWith(needle)) return 5
  return 6
}

const sameName = (player: SearchPlayer, name: string, tag: string): boolean =>
  player.name.toLowerCase() === name.toLowerCase() && player.tag.toLowerCase() === tag.toLowerCase()

const escapeGlob = (value: string): string =>
  value.replaceAll('*', '[*]').replaceAll('?', '[?]').replaceAll('[', '[[]')

const addCandidate = (target: Map<string, SearchCandidate>, candidate: SearchCandidate): void => {
  const existing = target.get(candidate.player.puuid)

  if (
    !existing ||
    candidate.bucket < existing.bucket ||
    (candidate.bucket === existing.bucket && (candidate.endedAt ?? 0) > (existing.endedAt ?? 0))
  ) {
    target.set(candidate.player.puuid, candidate)
  }
}

export const searchPlayers = (
  query: string,
  options: SearchOptions = {},
): Effect.Effect<PlayerSearch, unknown, Database> =>
  Effect.gen(function* () {
    const db = yield* Database
    const trimmed = query.trim()
    const limit = Math.max(1, Math.min(options.limit ?? searchDefaultLimit, searchMaxLimit))

    if (trimmed.length < searchMinQueryLength) {
      return emptySearch(trimmed, limit)
    }

    const needle = trimmed.toLowerCase()
    const fts = `"${needle.replaceAll('"', '""')}"`
    const ftsCurrent = `${fts} AND kind:current`
    const ftsPast = `${fts} AND kind:past`
    const glob = `${escapeGlob(needle)}*`
    const cutoff = (options.now ?? Date.now()) - (options.indexWindowDays ?? 30) * dayMs
    const region = options.region ?? null
    const candidateLimit = Math.max(searchCandidateLimit, limit * 5)

    const currentPrefixRows = yield* db.all<SearchRow>(sql`
      select
        p.puuid, p.name, p.tag, p.region, p.card_id,
        p.name_changes, p.region_changes, p.first_seen_at, p.last_seen_at,
        p.name as match_name, p.tag as match_tag,
        null as started_at, null as ended_at
      from player_search s
      join players p on p.puuid = s.puuid
      where s.kind = 'current'
        and p.is_banned = 0
        and p.last_seen_at >= ${cutoff}
        and (${region} is null or p.region = ${region})
        and (
          s.name_folded glob ${glob}
          or s.tag_folded glob ${glob}
          or s.combined_folded glob ${glob}
        )
      limit ${candidateLimit}
    `)

    const currentSubstringRows = yield* db.all<SearchRow>(sql`
      select
        p.puuid, p.name, p.tag, p.region, p.card_id,
        p.name_changes, p.region_changes, p.first_seen_at, p.last_seen_at,
        p.name as match_name, p.tag as match_tag,
        null as started_at, null as ended_at
      from player_search_fts
      join player_search s on s.id = player_search_fts.rowid and s.kind = 'current'
      join players p on p.puuid = s.puuid
      where player_search_fts match ${ftsCurrent}
        and p.is_banned = 0
        and p.last_seen_at >= ${cutoff}
        and (${region} is null or p.region = ${region})
      limit ${candidateLimit}
    `)

    const pastPrefixRows = yield* db.all<SearchRow>(sql`
      select
        p.puuid, p.name, p.tag, p.region, p.card_id,
        p.name_changes, p.region_changes, p.first_seen_at, p.last_seen_at,
        s.name as match_name, s.tag as match_tag,
        n.started_at, s.ended_at
      from player_search s
      join player_names n on n.id = s.player_name_id
      join players p on p.puuid = s.puuid
      where s.kind = 'past'
        and s.ended_at is not null
        and p.is_banned = 0
        and p.last_seen_at >= ${cutoff}
        and (${region} is null or p.region = ${region})
        and (
          s.name_folded glob ${glob}
          or s.tag_folded glob ${glob}
          or s.combined_folded glob ${glob}
        )
      limit ${candidateLimit}
    `)

    const pastSubstringRows = yield* db.all<SearchRow>(sql`
      select
        p.puuid, p.name, p.tag, p.region, p.card_id,
        p.name_changes, p.region_changes, p.first_seen_at, p.last_seen_at,
        s.name as match_name, s.tag as match_tag,
        n.started_at, s.ended_at
      from player_search_fts
      join player_search s on s.id = player_search_fts.rowid and s.kind = 'past'
      join player_names n on n.id = s.player_name_id
      join players p on p.puuid = s.puuid
      where player_search_fts match ${ftsPast}
        and s.ended_at is not null
        and p.is_banned = 0
        and p.last_seen_at >= ${cutoff}
        and (${region} is null or p.region = ${region})
      limit ${candidateLimit}
    `)

    const currentCandidates = new Map<string, SearchCandidate>()

    for (const row of [...currentPrefixRows, ...currentSubstringRows]) {
      addCandidate(currentCandidates, {
        player: toSearchPlayer(row),
        matchName: row.match_name,
        matchTag: row.match_tag,
        startedAt: null,
        endedAt: null,
        bucket: matchBucket(row.match_name, row.match_tag, needle),
      })
    }

    const pastCandidates = new Map<string, SearchCandidate>()

    for (const row of [...pastPrefixRows, ...pastSubstringRows]) {
      const player = toSearchPlayer(row)

      if (sameName(player, row.match_name, row.match_tag)) {
        continue
      }

      addCandidate(pastCandidates, {
        player,
        matchName: row.match_name,
        matchTag: row.match_tag,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        bucket: matchBucket(row.match_name, row.match_tag, needle),
      })
    }

    const currentSorted = [...currentCandidates.values()].sort(
      (left, right) =>
        left.bucket - right.bucket ||
        right.player.lastSeenAt - left.player.lastSeenAt ||
        left.player.puuid.localeCompare(right.player.puuid),
    )
    const pastSorted = [...pastCandidates.values()].sort(
      (left, right) =>
        left.bucket - right.bucket ||
        (right.endedAt ?? 0) - (left.endedAt ?? 0) ||
        right.player.lastSeenAt - left.player.lastSeenAt ||
        left.player.puuid.localeCompare(right.player.puuid),
    )
    const currentTruncated =
      currentPrefixRows.length >= candidateLimit ||
      currentSubstringRows.length >= candidateLimit ||
      currentSorted.length > limit
    const pastTruncated =
      pastPrefixRows.length >= candidateLimit ||
      pastSubstringRows.length >= candidateLimit ||
      pastSorted.length > limit
    const current = currentSorted.slice(0, limit)
    const past = pastSorted.slice(0, limit)

    return {
      query: trimmed,
      minQueryLength: searchMinQueryLength,
      limit,
      current: {
        total: currentSorted.length,
        truncated: currentTruncated,
        players: current.map((candidate) => candidate.player),
      },
      past: {
        total: pastSorted.length,
        truncated: pastTruncated,
        matches: past.map(
          (candidate) =>
            ({
              player: candidate.player,
              name: candidate.matchName,
              tag: candidate.matchTag,
              startedAt: candidate.startedAt ?? 0,
              endedAt: candidate.endedAt ?? 0,
            }) satisfies SearchMatch,
        ),
      },
    }
  })

export const defaultPlayerPageSize = 250
export const maxPlayerPageSize = 250

type PlayerCursorBase = { readonly v: 1; readonly sort: PlayerSort }

export type PlayerCursor =
  | (PlayerCursorBase & { sort: 'recent'; lastSeenAt: number; puuid: string })
  | (PlayerCursorBase & { sort: 'new'; firstSeenAt: number; puuid: string })
  | (PlayerCursorBase & {
      sort: 'recentChanges'
      lastNameChangeAt: number
      lastSeenAt: number
      puuid: string
    })
  | (PlayerCursorBase & { sort: 'changes'; score: number; lastSeenAt: number; puuid: string })
  | (PlayerCursorBase & { sort: 'name'; name: string; tag: string; puuid: string })

export type PlayerPageOptions = {
  readonly sort: PlayerSort
  readonly region?: Region | null
  readonly cursor?: PlayerCursor | null
  readonly limit?: number
  readonly now?: number
  readonly indexWindowDays?: number
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)
const isText = (value: unknown): value is string => typeof value === 'string'

export const decodePlayerCursor = (value: string): PlayerCursor | null => {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >

    if (parsed.v !== 1 || !isText(parsed.sort) || !isText(parsed.puuid)) return null

    switch (parsed.sort) {
      case 'recent':
        return isFiniteNumber(parsed.lastSeenAt)
          ? { v: 1, sort: 'recent', lastSeenAt: parsed.lastSeenAt, puuid: parsed.puuid }
          : null
      case 'new':
        return isFiniteNumber(parsed.firstSeenAt)
          ? { v: 1, sort: 'new', firstSeenAt: parsed.firstSeenAt, puuid: parsed.puuid }
          : null
      case 'recentChanges':
        return isFiniteNumber(parsed.lastNameChangeAt) && isFiniteNumber(parsed.lastSeenAt)
          ? {
              v: 1,
              sort: 'recentChanges',
              lastNameChangeAt: parsed.lastNameChangeAt,
              lastSeenAt: parsed.lastSeenAt,
              puuid: parsed.puuid,
            }
          : null
      case 'changes':
        return isFiniteNumber(parsed.score) && isFiniteNumber(parsed.lastSeenAt)
          ? {
              v: 1,
              sort: 'changes',
              score: parsed.score,
              lastSeenAt: parsed.lastSeenAt,
              puuid: parsed.puuid,
            }
          : null
      case 'name':
        return isText(parsed.name) && isText(parsed.tag)
          ? { v: 1, sort: 'name', name: parsed.name, tag: parsed.tag, puuid: parsed.puuid }
          : null
      default:
        return null
    }
  } catch {
    return null
  }
}

const encodePlayerCursor = (sort: PlayerSort, row: PlayerRow): string => {
  let payload: PlayerCursor

  switch (sort) {
    case 'recent':
      payload = { v: 1, sort, lastSeenAt: row.last_seen_at, puuid: row.puuid }
      break
    case 'new':
      payload = { v: 1, sort, firstSeenAt: row.first_seen_at, puuid: row.puuid }
      break
    case 'recentChanges':
      payload = {
        v: 1,
        sort,
        lastNameChangeAt: row.last_name_change_at ?? 0,
        lastSeenAt: row.last_seen_at,
        puuid: row.puuid,
      }
      break
    case 'changes':
      payload = {
        v: 1,
        sort,
        score: row.name_changes * 2 + row.region_changes * 3,
        lastSeenAt: row.last_seen_at,
        puuid: row.puuid,
      }
      break
    case 'name':
      payload = {
        v: 1,
        sort,
        name: (row.name ?? '').toLowerCase(),
        tag: (row.tag ?? '').toLowerCase(),
        puuid: row.puuid,
      }
      break
  }

  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

export const listPlayersPage = (
  options: PlayerPageOptions,
): Effect.Effect<PlayerPage, unknown, Database> =>
  Effect.gen(function* () {
    const db = yield* Database
    const sort = options.sort
    const limit = Math.max(1, Math.min(options.limit ?? defaultPlayerPageSize, maxPlayerPageSize))
    const cutoff = (options.now ?? Date.now()) - (options.indexWindowDays ?? 30) * dayMs
    const region = options.region ?? null
    const cursor = options.cursor ?? null
    let after = sql``
    let order = sql`last_seen_at desc, puuid desc`

    if (sort === 'new') {
      order = sql`first_seen_at desc, puuid desc`
    } else if (sort === 'recentChanges') {
      order = sql`coalesce(last_name_change_at, 0) desc, last_seen_at desc, puuid desc`
    } else if (sort === 'changes') {
      order = sql`(name_changes * 2 + region_changes * 3) desc, last_seen_at desc, puuid desc`
    } else if (sort === 'name') {
      order = sql`lower(coalesce(name, '')) asc, lower(coalesce(tag, '')) asc, puuid asc`
    }

    if (cursor?.sort === 'recent') {
      after = sql`and (
        last_seen_at < ${cursor.lastSeenAt}
        or (last_seen_at = ${cursor.lastSeenAt} and puuid < ${cursor.puuid})
      )`
    } else if (cursor?.sort === 'new') {
      after = sql`and (
        first_seen_at < ${cursor.firstSeenAt}
        or (first_seen_at = ${cursor.firstSeenAt} and puuid < ${cursor.puuid})
      )`
    } else if (cursor?.sort === 'recentChanges') {
      after = sql`and (
        coalesce(last_name_change_at, 0) < ${cursor.lastNameChangeAt}
        or (
          coalesce(last_name_change_at, 0) = ${cursor.lastNameChangeAt}
          and last_seen_at < ${cursor.lastSeenAt}
        )
        or (
          coalesce(last_name_change_at, 0) = ${cursor.lastNameChangeAt}
          and last_seen_at = ${cursor.lastSeenAt}
          and puuid < ${cursor.puuid}
        )
      )`
    } else if (cursor?.sort === 'changes') {
      after = sql`and (
        (name_changes * 2 + region_changes * 3) < ${cursor.score}
        or (
          (name_changes * 2 + region_changes * 3) = ${cursor.score}
          and last_seen_at < ${cursor.lastSeenAt}
        )
        or (
          (name_changes * 2 + region_changes * 3) = ${cursor.score}
          and last_seen_at = ${cursor.lastSeenAt}
          and puuid < ${cursor.puuid}
        )
      )`
    } else if (cursor?.sort === 'name') {
      after = sql`and (
        lower(coalesce(name, '')) > ${cursor.name}
        or (
          lower(coalesce(name, '')) = ${cursor.name}
          and lower(coalesce(tag, '')) > ${cursor.tag}
        )
        or (
          lower(coalesce(name, '')) = ${cursor.name}
          and lower(coalesce(tag, '')) = ${cursor.tag}
          and puuid > ${cursor.puuid}
        )
      )`
    }

    const rows = yield* db.all<PlayerRow>(sql`
      select
        puuid, name, tag, card_id, region, is_anonymized,
        name_changes, region_changes, ban_count, unban_count,
        first_seen_at, last_seen_at, last_name_change_at, last_region_change_at
      from players
      where is_banned = 0
        and last_seen_at >= ${cutoff}
        and (${region} is null or region = ${region})
        ${after}
      order by ${order}
      limit ${limit + 1}
    `)

    const hasMore = rows.length > limit
    const pageRows = rows.slice(0, limit)
    const last = pageRows.at(-1)

    return {
      sort,
      region,
      players: pageRows.map(toSearchPlayer),
      nextCursor: hasMore && last ? encodePlayerCursor(sort, last) : null,
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
