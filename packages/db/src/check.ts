import { sql } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database } from './client.ts'

export type DatabaseCheckReport = {
  readonly ok: boolean
  readonly integrity: string
  readonly issues: ReadonlyArray<string>
  readonly counts: Readonly<Record<string, number>>
}

const overlapQuery = (table: 'player_names' | 'player_regions' | 'banned_players') => sql`
  select count(*) as n
  from ${sql.raw(table)} a
  join ${sql.raw(table)} b on a.puuid = b.puuid and a.id < b.id
  where a.started_at < coalesce(b.ended_at, 9999999999999)
    and b.started_at < coalesce(a.ended_at, 9999999999999)
`

export const checkDatabase = Effect.gen(function* () {
  const db = yield* Database

  const integrityRows = yield* db.all<{ integrity_check: string }>(sql`pragma integrity_check`)
  const integrity = integrityRows.map((row) => row.integrity_check).join('; ')

  const count = (query: ReturnType<typeof overlapQuery>) =>
    db.get<{ n: number }>(query).pipe(Effect.map((row) => row?.n ?? 0))

  const nameOverlaps = yield* count(overlapQuery('player_names'))
  const regionOverlaps = yield* count(overlapQuery('player_regions'))
  const banOverlaps = yield* count(overlapQuery('banned_players'))

  const openNameDuplicatesRows = yield* db.all<{ n: number }>(sql`
    select count(*) as n from (
      select puuid from player_names where ended_at is null group by puuid having count(*) > 1
    )
  `)
  const openRegionDuplicatesRows = yield* db.all<{ n: number }>(sql`
    select count(*) as n from (
      select puuid from player_regions where ended_at is null group by puuid having count(*) > 1
    )
  `)
  const openBanDuplicatesRows = yield* db.all<{ n: number }>(sql`
    select count(*) as n from (
      select puuid from banned_players where ended_at is null group by puuid having count(*) > 1
    )
  `)

  const currentNameMismatchRows = yield* db.all<{ n: number }>(sql`
    select count(*) as n
    from players p
    left join player_names n on n.puuid = p.puuid and n.ended_at is null
    where (p.name is not null and (n.id is null or n.name != p.name or n.tag != p.tag))
       or (p.name is null and n.id is not null)
  `)
  const currentRegionMismatchRows = yield* db.all<{ n: number }>(sql`
    select count(*) as n
    from players p
    left join player_regions r on r.puuid = p.puuid and r.ended_at is null
    where (p.region is not null and (r.id is null or r.region != p.region))
       or (p.region is null and r.id is not null)
  `)
  const invalidSeenRangeRows = yield* db.all<{ n: number }>(sql`
    select count(*) as n from players where first_seen_at > last_seen_at
  `)
  const invalidLatestRunRows = yield* db.all<{ n: number }>(sql`
    select count(*) as n
    from meta m
    left join runs r on cast(m.value as integer) = r.id
    where m.key = 'latestSuccessfulRunId'
      and (r.id is null or r.status != 'succeeded')
  `)
  const invalidAnonymousRows = yield* db.all<{ n: number }>(sql`
    select count(*) as n
    from anonymous_rows
    where (status = 'linked' and resolved_puuid is null)
       or (status = 'unresolved' and resolved_puuid is not null)
  `)

  const counts = {
    nameOverlaps,
    regionOverlaps,
    banOverlaps,
    openNameDuplicates: openNameDuplicatesRows[0]?.n ?? 0,
    openRegionDuplicates: openRegionDuplicatesRows[0]?.n ?? 0,
    openBanDuplicates: openBanDuplicatesRows[0]?.n ?? 0,
    currentNameMismatches: currentNameMismatchRows[0]?.n ?? 0,
    currentRegionMismatches: currentRegionMismatchRows[0]?.n ?? 0,
    invalidSeenRanges: invalidSeenRangeRows[0]?.n ?? 0,
    invalidLatestRuns: invalidLatestRunRows[0]?.n ?? 0,
    invalidAnonymousRows: invalidAnonymousRows[0]?.n ?? 0,
  }

  const issues = Object.entries(counts)
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => `${key}: ${value}`)

  if (integrity !== 'ok') {
    issues.push(`integrity: ${integrity}`)
  }

  return {
    ok: issues.length === 0,
    integrity,
    issues,
    counts,
  } satisfies DatabaseCheckReport
})
