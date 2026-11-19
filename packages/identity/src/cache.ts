// @effect-diagnostics globalDate:off globalDateInEffect:off
import { Database, matchCandidates } from '@riotid/db'
import { sql } from 'drizzle-orm'
import { Effect } from 'effect'

export type MatchCacheStats = {
  readonly rows: number
  readonly matches: number
  readonly perRegion: Record<
    string,
    { readonly rows: number; readonly matches: number; readonly oldest: string | null }
  >
}

export const matchCacheStats: Effect.Effect<MatchCacheStats, unknown, Database> = Effect.gen(
  function* () {
    const db = yield* Database
    const totals = yield* db.get<{ rows: number; matches: number }>(sql`
      select count(*) as rows, count(distinct match_id) as matches from match_candidates
    `)
    const regions = yield* db.all<{
      region: string
      rows: number
      matches: number
      oldest: number | null
    }>(sql`
      select
        region,
        count(*) as rows,
        count(distinct match_id) as matches,
        min(game_start_at) as oldest
      from match_candidates
      group by region
    `)

    return {
      rows: totals?.rows ?? 0,
      matches: totals?.matches ?? 0,
      perRegion: Object.fromEntries(
        regions.map((row) => [
          row.region,
          {
            rows: row.rows,
            matches: row.matches,
            oldest: row.oldest ? new Date(row.oldest).toISOString() : null,
          },
        ]),
      ),
    }
  },
)

export const pruneMatchCache = (options: {
  readonly olderThanDays: number
  readonly matchesPerRegion: number
  readonly now?: number
}): Effect.Effect<{ readonly deleted: number }, unknown, Database> =>
  Effect.gen(function* () {
    const db = yield* Database
    const now = options.now ?? Date.now()
    const cutoff = now - options.olderThanDays * 86_400_000
    const before = yield* db.get<{ total: number }>(
      sql`select count(*) as total from match_candidates`,
    )

    yield* db.delete(matchCandidates).where(sql`${matchCandidates.createdAt} < ${cutoff}`)

    const regions = yield* db.all<{ region: string; matches: number }>(sql`
      select region, count(distinct match_id) as matches
      from match_candidates
      group by region
    `)

    for (const region of regions) {
      const excess = region.matches - options.matchesPerRegion

      if (excess > 0) {
        yield* db.run(sql`
          delete from match_candidates
          where region = ${region.region}
            and match_id in (
              select match_id from match_candidates
              where region = ${region.region}
              group by match_id
              order by max(game_start_at) asc
              limit ${excess}
            )
        `)
      }
    }

    const after = yield* db.get<{ total: number }>(
      sql`select count(*) as total from match_candidates`,
    )

    return { deleted: (before?.total ?? 0) - (after?.total ?? 0) }
  })

export type AnonymousStats = {
  readonly total: number
  readonly unresolved: number
  readonly linked: number
  readonly ignored: number
  readonly byRegion: Record<
    string,
    { readonly unresolved: number; readonly linked: number; readonly ignored: number }
  >
  readonly pendingSample: ReadonlyArray<{
    readonly id: number
    readonly region: string
    readonly leaderboardRank: number
    readonly rankedRating: number
    readonly competitiveTier: number
    readonly lastTriedAt: string | null
  }>
}

export const anonymousStats: Effect.Effect<AnonymousStats, unknown, Database> = Effect.gen(
  function* () {
    const db = yield* Database
    const regions = yield* db.all<{
      region: string
      unresolved: number
      linked: number
      ignored: number
    }>(sql`
      select
        region,
        sum(case when status = 'unresolved' then 1 else 0 end) as unresolved,
        sum(case when status = 'linked' then 1 else 0 end) as linked,
        sum(case when status = 'ignored' then 1 else 0 end) as ignored
      from anonymous_rows
      group by region
    `)
    const pending = yield* db.all<{
      id: number
      region: string
      leaderboard_rank: number
      ranked_rating: number
      competitive_tier: number
      last_tried_at: number | null
    }>(sql`
      select id, region, leaderboard_rank, ranked_rating, competitive_tier, last_tried_at
      from anonymous_rows
      where status = 'unresolved'
      order by last_tried_at, id
      limit 10
    `)

    return {
      total: regions.reduce((sum, row) => sum + row.unresolved + row.linked + row.ignored, 0),
      unresolved: regions.reduce((sum, row) => sum + row.unresolved, 0),
      linked: regions.reduce((sum, row) => sum + row.linked, 0),
      ignored: regions.reduce((sum, row) => sum + row.ignored, 0),
      byRegion: Object.fromEntries(
        regions.map((row) => [
          row.region,
          { unresolved: row.unresolved, linked: row.linked, ignored: row.ignored },
        ]),
      ),
      pendingSample: pending.map((row) => ({
        id: row.id,
        region: row.region,
        leaderboardRank: row.leaderboard_rank,
        rankedRating: row.ranked_rating,
        competitiveTier: row.competitive_tier,
        lastTriedAt: row.last_tried_at ? new Date(row.last_tried_at).toISOString() : null,
      })),
    }
  },
)
