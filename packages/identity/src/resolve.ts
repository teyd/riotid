// @effect-diagnostics globalDate:off globalDateInEffect:off globalJsonInEffect:off
import {
  anonymousRows,
  Database,
  identityLinks,
  leaderboardSeeds,
  matchCandidates,
  meta,
  playerNames,
  playerRegions,
  players,
} from '@riotid/db'
import { RiotSource, type AuthSession, type Mmr } from '@riotid/riot'
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { Clock, Data, Effect } from 'effect'

const regions = ['na', 'eu', 'ap', 'kr'] as const
type Region = (typeof regions)[number]

const regionList: ReadonlyArray<Region> = regions
const maxCandidatesPerRow = 100
const maxMatchDetailsPerPass = (limit: number) => Math.min(300, Math.max(10, limit * 3))

export class CrawlerPausedError extends Data.TaggedError('CrawlerPausedError')<{
  readonly message: string
}> {}

export type ResolveConfig = {
  readonly session: AuthSession
  readonly budget: number
  readonly seeds: number
  readonly coverageTarget: number
  readonly cacheEnabled: boolean
  readonly cacheMatchesPerRegion: number
  readonly cacheMaxMatchesPerRegion: number
  readonly autotune: boolean
  readonly limit: number
  readonly now?: number
}

export type ResolveResult = {
  readonly linked: number
  readonly unresolved: number
  readonly ambiguous: number
  readonly tried: number
  readonly requests: number
  readonly seeds: number
  readonly matchesFetched: number
  readonly coverage: number
  readonly matchCap: number
}

type Meter = { used: number; budget: number }

type Candidate = {
  readonly puuid: string
  readonly region: Region
  readonly matchId: string
  readonly cardId: string
  readonly titleId: string
  readonly competitiveTier: number
  readonly gameStartAt: Date
}

type LinkPlan = {
  readonly rowId: number
  readonly puuid: string
  readonly region: Region
  readonly seasonId: string
  readonly matchId: string | null
  readonly cardId: string
  readonly method: 'direct_puuid' | 'match_graph'
  readonly confidence: number
  readonly evidence: Record<string, unknown>
}

type Fingerprint = {
  readonly leaderboardRank: number
  readonly rankedRating: number
  readonly numberOfWins: number
  readonly competitiveTier: number
}

const fingerprintFor = (mmr: Mmr, seasonId: string): Fingerprint | null => {
  const info = mmr.QueueSkills.competitive?.SeasonalInfoBySeasonID?.[seasonId]

  return info
    ? {
        leaderboardRank: info.LeaderboardRank,
        rankedRating: info.RankedRating,
        numberOfWins: info.NumberOfWins,
        competitiveTier: info.CompetitiveTier,
      }
    : null
}

const matchesRow = (
  row: Fingerprint & { readonly cardId: string; readonly titleId: string },
  fingerprint: Fingerprint,
) =>
  fingerprint.leaderboardRank === row.leaderboardRank &&
  fingerprint.rankedRating === row.rankedRating &&
  fingerprint.numberOfWins === row.numberOfWins &&
  fingerprint.competitiveTier === row.competitiveTier

const readMeta = (key: string) =>
  Effect.gen(function* () {
    const db = yield* Database
    const row = yield* db.get<{ value: string }>(sql`select value from meta where key = ${key}`)
    return row?.value ?? null
  })

const writeMeta = (key: string, value: string, now: Date) =>
  Effect.gen(function* () {
    const db = yield* Database
    yield* db
      .insert(meta)
      .values({ key, value, updatedAt: now })
      .onConflictDoUpdate({ target: meta.key, set: { value, updatedAt: now } })
  })

const coverageHistory = (raw: string | null): Array<{ date: string; coverage: number }> => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const resolveAnonymous = (
  config: ResolveConfig,
): Effect.Effect<ResolveResult, unknown, Database | RiotSource> =>
  Effect.gen(function* () {
    const db = yield* Database
    const source = yield* RiotSource
    const now = config.now ?? (yield* Clock.currentTimeMillis)
    const nowDate = new Date(now)
    const today = nowDate.toISOString().slice(0, 10)
    const scan = yield* db.get<{ n: number }>(
      sql`select count(*) as n from runs where status = 'running'`,
    )

    if ((scan?.n ?? 0) > 0) {
      yield* writeMeta(
        'anon:progress',
        JSON.stringify({
          phase: 'paused',
          message: 'Leaderboard scan is running; crawler yielded',
          updatedAt: now,
        }),
        nowDate,
      )
      return yield* new CrawlerPausedError({
        message: 'Leaderboard scan is running; crawler yielded.',
      })
    }

    const version = yield* source.getVersion
    yield* writeMeta('anon:runningSince', String(now), nowDate)
    const usedToday = Number((yield* readMeta(`anon:requests:${today}`)) ?? '0')
    const meter: Meter = { used: Number.isFinite(usedToday) ? usedToday : 0, budget: config.budget }
    const mmrCache = new Map<string, Fingerprint | null>()
    const progress = {
      phase: 'starting',
      message: 'Refreshing the Riot session',
      region: null as Region | null,
      startedAt: now,
      seedsDone: 0,
      seedsTotal: config.seeds,
      matchesFetched: 0,
      requests: meter.used,
      budget: meter.budget,
      linked: 0,
      ambiguous: 0,
      tried: 0,
      limit: config.limit,
      currentMatchId: null as string | null,
      updatedAt: now,
    }
    const report = (patch: Partial<typeof progress>) =>
      Effect.gen(function* () {
        Object.assign(progress, patch, { updatedAt: now })
        yield* writeMeta('anon:progress', JSON.stringify(progress), nowDate)
      })

    yield* report({})

    const canSpend = () => meter.used < meter.budget
    const spend = () => {
      meter.used += 1
    }

    const requestMmr = (region: Region, puuid: string, seasonId: string) =>
      Effect.gen(function* () {
        const key = `${region}:${puuid}:${seasonId}`
        if (mmrCache.has(key)) return mmrCache.get(key) ?? null
        if (!canSpend()) return null

        spend()
        yield* Effect.sleep('150 millis')
        const result = yield* source
          .getMmr(config.session, version.riotClientVersion, region, puuid)
          .pipe(
            Effect.map((mmr) => fingerprintFor(mmr, seasonId)),
            Effect.catchTag('RiotRequestError', () => Effect.succeed(null)),
          )
        mmrCache.set(key, result)
        return result
      })

    const unresolvedRows = yield* db
      .select()
      .from(anonymousRows)
      .where(eq(anonymousRows.status, 'unresolved'))
      .orderBy(anonymousRows.lastTriedAt, anonymousRows.id)
      .limit(config.limit)
    const plans: LinkPlan[] = []
    let ambiguous = 0

    for (const row of unresolvedRows) {
      if (row.puuid && row.puuid.length > 0) {
        plans.push({
          rowId: row.id,
          puuid: row.puuid.toLowerCase(),
          region: row.region,
          seasonId: row.seasonId,
          matchId: null,
          cardId: row.cardId,
          method: 'direct_puuid',
          confidence: 10_000,
          evidence: {
            leaderboardRank: row.leaderboardRank,
            rankedRating: row.rankedRating,
            numberOfWins: row.numberOfWins,
            competitiveTier: row.competitiveTier,
            cardId: row.cardId,
            titleId: row.titleId,
          },
        })
      }
    }

    const directRowIds = new Set(plans.map((plan) => plan.rowId))
    const graphRows = unresolvedRows.filter((row) => !directRowIds.has(row.id))
    const names = new Map<string, { name: string; tag: string }>()
    const passCandidates: Candidate[] = []
    let seeds = 0
    let matchesFetched = 0

    if (graphRows.length > 0 && config.seeds > 0) {
      const matchStart = new Map<string, { region: Region; gameStartAt: Date }>()

      for (const region of regionList) {
        if (!graphRows.some((row) => row.region === region)) continue

        yield* report({
          phase: 'seeds',
          message: 'Collecting nearby players for the match graph',
          region,
          seedsDone: seeds,
        })
        const linkedSeeds = yield* db
          .select({ puuid: anonymousRows.resolvedPuuid })
          .from(anonymousRows)
          .where(
            and(
              eq(anonymousRows.region, region),
              eq(anonymousRows.status, 'linked'),
              sql`${anonymousRows.resolvedPuuid} is not null`,
            ),
          )
          .limit(config.seeds)
        const seedPuuids = new Set<string>(
          linkedSeeds.flatMap((seed) => (seed.puuid ? [seed.puuid] : [])),
        )
        const regionRows = graphRows.filter((row) => row.region === region)

        for (const target of regionRows.slice(0, 20)) {
          if (seedPuuids.size >= config.seeds) break

          const near = yield* db
            .select({ puuid: leaderboardSeeds.puuid })
            .from(leaderboardSeeds)
            .where(
              and(
                eq(leaderboardSeeds.region, region),
                eq(leaderboardSeeds.seasonId, target.seasonId),
                gte(leaderboardSeeds.leaderboardRank, target.leaderboardRank - 100),
                lte(leaderboardSeeds.leaderboardRank, target.leaderboardRank + 100),
              ),
            )
            .orderBy(asc(sql`abs(${leaderboardSeeds.leaderboardRank} - ${target.leaderboardRank})`))
            .limit(20)

          for (const seed of near) {
            seedPuuids.add(seed.puuid)
          }
        }

        if (seedPuuids.size < config.seeds) {
          const knownSeeds = yield* db
            .select({ puuid: players.puuid })
            .from(players)
            .where(and(eq(players.region, region), eq(players.isBanned, false)))
            .orderBy(desc(players.lastSeenAt))
            .limit(config.seeds)

          for (const seed of knownSeeds) {
            seedPuuids.add(seed.puuid)
          }
        }

        for (const puuid of [...seedPuuids].slice(0, config.seeds)) {
          if (!canSpend()) break

          seeds += 1
          spend()
          yield* Effect.sleep('150 millis')
          const history = yield* source
            .getMatchHistory(config.session, version.riotClientVersion, region, puuid)
            .pipe(Effect.catchTag('RiotRequestError', () => Effect.succeed(null)))

          for (const match of history?.History ?? []) {
            if (!matchStart.has(match.MatchID)) {
              matchStart.set(match.MatchID, {
                region,
                gameStartAt: new Date(match.GameStartTime),
              })
            }
          }

          if (seeds % 5 === 0) {
            yield* report({
              phase: 'seeds',
              message: 'Collecting nearby players for the match graph',
              region,
              seedsDone: seeds,
              requests: meter.used,
            })
          }
        }
      }

      const matchIds = [...matchStart.keys()]
      const cached = config.cacheEnabled
        ? yield* db
            .select({ matchId: matchCandidates.matchId })
            .from(matchCandidates)
            .where(inArray(matchCandidates.matchId, matchIds.length > 0 ? matchIds : ['']))
        : []
      const cachedIds = new Set(cached.map((row) => row.matchId))
      const fresh = matchIds
        .filter((matchId) => !cachedIds.has(matchId))
        .slice(0, maxMatchDetailsPerPass(config.limit))

      for (const matchId of fresh) {
        if (!canSpend()) break
        const start = matchStart.get(matchId)
        if (!start) continue

        spend()
        matchesFetched += 1

        if (matchesFetched % 10 === 0) {
          const active = yield* db.get<{ n: number }>(
            sql`select count(*) as n from runs where status = 'running'`,
          )

          if ((active?.n ?? 0) > 0) {
            yield* report({
              phase: 'paused',
              message: 'Leaderboard scan started; crawler yielded',
              currentMatchId: null,
            })
            yield* writeMeta('anon:runningSince', '0', nowDate)
            return yield* new CrawlerPausedError({
              message: 'Leaderboard scan started; crawler yielded.',
            })
          }
        }

        yield* Effect.sleep('150 millis')
        yield* report({
          phase: 'matches',
          message: 'Fetching new match details',
          region: start.region,
          matchesFetched,
          currentMatchId: matchId,
          requests: meter.used,
        })
        const details = yield* source
          .getMatchDetails(config.session, version.riotClientVersion, start.region, matchId)
          .pipe(Effect.catchTag('RiotRequestError', () => Effect.succeed(null)))

        if (!details) continue

        for (const participant of details.players) {
          const puuid = participant.subject?.toLowerCase()
          if (!puuid) continue
          if (participant.gameName.length > 0) {
            names.set(puuid, { name: participant.gameName, tag: participant.tagLine })
          }
          const candidate: Candidate = {
            puuid,
            region: start.region,
            matchId,
            cardId: participant.playerCard,
            titleId: participant.playerTitle,
            competitiveTier: participant.competitiveTier,
            gameStartAt: start.gameStartAt,
          }
          passCandidates.push(candidate)

          if (config.cacheEnabled) {
            yield* db
              .insert(matchCandidates)
              .values({
                matchId,
                puuid,
                region: start.region,
                gameStartAt: start.gameStartAt,
                cardId: participant.playerCard,
                titleId: participant.playerTitle,
                accountLevel: participant.accountLevel,
                competitiveTier: participant.competitiveTier,
              })
              .onConflictDoNothing()
          }
        }
      }
    }

    const knownPlayers = yield* db.select({ puuid: players.puuid }).from(players)
    const known = new Set(knownPlayers.map((row) => row.puuid))
    const passKey = (candidate: Candidate) =>
      `${candidate.region}:${candidate.competitiveTier}:${candidate.cardId}:${candidate.titleId}`

    yield* report({
      phase: 'matching',
      message: 'Comparing MMR fingerprints',
      matchesFetched,
      requests: meter.used,
    })

    for (const [index, row] of graphRows.entries()) {
      if (!canSpend()) break

      if (index % 25 === 0) {
        yield* report({
          phase: 'matching',
          message: 'Comparing MMR fingerprints',
          tried: index,
          linked: plans.length,
          ambiguous,
          requests: meter.used,
          region: row.region,
        })
      }

      const key = `${row.region}:${row.competitiveTier}:${row.cardId}:${row.titleId}`
      const cached = config.cacheEnabled
        ? yield* db
            .select({
              puuid: matchCandidates.puuid,
              matchId: matchCandidates.matchId,
              cardId: matchCandidates.cardId,
              titleId: matchCandidates.titleId,
              competitiveTier: matchCandidates.competitiveTier,
              gameStartAt: matchCandidates.gameStartAt,
            })
            .from(matchCandidates)
            .where(
              and(
                eq(matchCandidates.region, row.region),
                eq(matchCandidates.competitiveTier, row.competitiveTier),
                eq(matchCandidates.cardId, row.cardId),
                eq(matchCandidates.titleId, row.titleId),
              ),
            )
            .orderBy(desc(matchCandidates.gameStartAt))
            .limit(maxCandidatesPerRow)
        : []
      const fresh = passCandidates.filter((candidate) => passKey(candidate) === key)
      const candidates = [
        ...cached.map((candidate) => ({ ...candidate, region: row.region })),
        ...fresh,
      ]
      const seen = new Set<string>()
      const matches: Array<{ puuid: string; matchId: string }> = []

      for (const candidate of candidates) {
        if (seen.has(candidate.puuid)) continue
        seen.add(candidate.puuid)
        if (known.has(candidate.puuid)) continue

        const fingerprint = yield* requestMmr(row.region, candidate.puuid, row.seasonId)

        if (fingerprint && matchesRow(row, fingerprint)) {
          matches.push({ puuid: candidate.puuid, matchId: candidate.matchId })
        }
      }

      if (matches.length === 1) {
        const match = matches[0]
        if (!match) continue
        plans.push({
          rowId: row.id,
          puuid: match.puuid,
          region: row.region,
          seasonId: row.seasonId,
          matchId: match.matchId,
          cardId: row.cardId,
          method: 'match_graph',
          confidence: 9_995,
          evidence: {
            leaderboardRank: row.leaderboardRank,
            rankedRating: row.rankedRating,
            numberOfWins: row.numberOfWins,
            competitiveTier: row.competitiveTier,
            cardId: row.cardId,
            titleId: row.titleId,
          },
        })
      } else if (matches.length > 1) {
        ambiguous += 1
      }
    }

    yield* report({
      phase: 'names',
      message: 'Resolving names for linked players',
      linked: plans.length,
      ambiguous,
      requests: meter.used,
    })

    const unnamed = yield* db
      .select({ puuid: players.puuid, region: players.region })
      .from(players)
      .where(
        and(eq(players.isAnonymized, true), sql`(${players.name} is null or ${players.name} = '')`),
      )
      .orderBy(desc(players.lastSeenAt))
      .limit(500)
    const unnamedByRegion = new Map<Region, string[]>()

    for (const player of unnamed) {
      if (!player.region) continue
      const list = unnamedByRegion.get(player.region) ?? []
      list.push(player.puuid)
      unnamedByRegion.set(player.region, list)
    }

    const fetchNames = (region: Region, puuids: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        if (!canSpend() || puuids.length === 0) return

        spend()
        yield* Effect.sleep('150 millis')
        const resolved = yield* source
          .getNameService(config.session, version.riotClientVersion, region, puuids)
          .pipe(Effect.catchTag('RiotRequestError', () => Effect.succeed([])))

        for (const entry of resolved) {
          if (entry.GameName.length > 0) {
            names.set(entry.Subject.toLowerCase(), { name: entry.GameName, tag: entry.TagLine })
          }
        }
      })

    for (const [region, puuids] of unnamedByRegion) {
      yield* fetchNames(region, puuids)
    }

    const linkedByRegion = new Map<Region, string[]>()

    for (const plan of plans) {
      if (names.has(plan.puuid)) continue
      const list = linkedByRegion.get(plan.region) ?? []
      list.push(plan.puuid)
      linkedByRegion.set(plan.region, list)
    }

    for (const [region, puuids] of linkedByRegion) {
      yield* fetchNames(region, puuids)
    }

    const planned = plans.map((plan) => ({
      ...plan,
      name: names.get(plan.puuid) ?? null,
    }))

    let didChange = plans.length > 0

    yield* db.run(sql`
      update players
      set card_id = coalesce(
        (
          select card_id from anonymous_rows
          where resolved_puuid = players.puuid and status = 'linked' and card_id <> ''
          order by last_seen_at desc limit 1
        ),
        (
          select card_id from match_candidates
          where puuid = players.puuid
          order by game_start_at desc limit 1
        )
      )
      where card_id is null
    `)

    yield* report({
      phase: 'apply',
      message: 'Writing links and intervals',
      linked: plans.length,
      ambiguous,
      tried: unresolvedRows.length,
      requests: meter.used,
    })

    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx.run(sql`
          update player_names
          set
            name = (select name from players where players.puuid = player_names.puuid),
            tag = (select tag from players where players.puuid = player_names.puuid),
            updated_at = ${nowDate.getTime()}
          where ended_at is null
            and name = ''
            and exists (
              select 1 from players
              where players.puuid = player_names.puuid and players.name <> ''
            )
        `)

        for (const [puuid, name] of names) {
          const patch = yield* tx
            .update(players)
            .set({ name: name.name, tag: name.tag, updatedAt: nowDate })
            .where(
              and(
                eq(players.puuid, puuid),
                sql`(${players.name} is null or ${players.name} = '' OR ${players.isAnonymized} = 1)`,
              ),
            )
            .returning({ puuid: players.puuid })

          if (patch.length > 0) {
            didChange = true
            const open = yield* tx
              .select({ id: playerNames.id })
              .from(playerNames)
              .where(and(eq(playerNames.puuid, puuid), isNull(playerNames.endedAt)))
              .limit(1)

            if (open.length === 0) {
              yield* tx.insert(playerNames).values({
                puuid,
                name: name.name,
                tag: name.tag,
                startedAt: nowDate,
                startedRunId: null,
                updatedAt: nowDate,
              })
            }
          }
        }

        for (const plan of planned) {
          const exists = known.has(plan.puuid)

          if (!exists) {
            yield* tx.insert(players).values({
              puuid: plan.puuid,
              name: plan.name?.name ?? null,
              tag: plan.name?.tag ?? null,
              cardId: plan.cardId ?? null,
              region: plan.region,
              isAnonymized: true,
              firstSeenAt: nowDate,
              lastSeenAt: nowDate,
              timesSeen: 1,
              updatedAt: nowDate,
            })

            if (plan.name && plan.name.name.length > 0) {
              yield* tx.insert(playerNames).values({
                puuid: plan.puuid,
                name: plan.name.name,
                tag: plan.name.tag,
                startedAt: nowDate,
                startedRunId: null,
                updatedAt: nowDate,
              })
            }

            yield* tx.insert(playerRegions).values({
              puuid: plan.puuid,
              region: plan.region,
              startedAt: nowDate,
              startedRunId: null,
              updatedAt: nowDate,
            })
          }

          yield* tx
            .update(anonymousRows)
            .set({
              status: 'linked',
              resolvedPuuid: plan.puuid,
              lastTriedAt: nowDate,
              updatedAt: nowDate,
            })
            .where(eq(anonymousRows.id, plan.rowId))

          yield* tx
            .insert(identityLinks)
            .values({
              anonymousRowId: plan.rowId,
              puuid: plan.puuid,
              region: plan.region,
              seasonId: plan.seasonId,
              matchId: plan.matchId,
              method: plan.method,
              confidence: plan.confidence,
              evidence: plan.evidence,
            })
            .onConflictDoNothing()
        }

        if (didChange) {
          yield* tx
            .insert(meta)
            .values({ key: 'indexVersion', value: '1', updatedAt: nowDate })
            .onConflictDoUpdate({
              target: meta.key,
              set: {
                value: sql`cast(${meta.value} as integer) + 1`,
                updatedAt: nowDate,
              },
            })
        }

        const tried = unresolvedRows.map((row) => row.id)
        if (tried.length > 0) {
          yield* tx
            .update(anonymousRows)
            .set({ lastTriedAt: nowDate })
            .where(and(inArray(anonymousRows.id, tried), isNull(anonymousRows.resolvedPuuid)))
        }
      }),
    )

    const totals = yield* db.get<{ total: number; linked: number; unresolved: number }>(sql`
      select
        count(*) as total,
        sum(case when status = 'linked' then 1 else 0 end) as linked,
        sum(case when status = 'unresolved' then 1 else 0 end) as unresolved
      from anonymous_rows
    `)
    const linked = totals?.linked ?? 0
    const unresolved = totals?.unresolved ?? 0
    const coverage = linked + unresolved > 0 ? linked / (linked + unresolved) : 1

    const capKey = 'anon:matchCap'
    const storedCap = Number((yield* readMeta(capKey)) ?? String(config.cacheMatchesPerRegion))
    let matchCap = Number.isFinite(storedCap) ? storedCap : config.cacheMatchesPerRegion
    const key = 'anon:coverageHistory'
    const history = coverageHistory(yield* readMeta(key)).filter((entry) => entry.date !== today)
    history.push({ date: today, coverage })
    const recent = history.slice(-7)

    if (
      config.autotune &&
      recent.length >= 7 &&
      recent.every((entry) => entry.coverage < config.coverageTarget) &&
      matchCap < config.cacheMaxMatchesPerRegion
    ) {
      matchCap = Math.min(matchCap * 2, config.cacheMaxMatchesPerRegion)
      history.length = 0
    }

    yield* report({
      phase: 'done',
      message: plans.length > 0 ? `Linked ${plans.length} rows` : 'Pass complete; no new links',
      linked: plans.length,
      ambiguous,
      tried: unresolvedRows.length,
      seedsDone: seeds,
      seedsTotal: config.seeds,
      requests: meter.used,
      currentMatchId: null,
    })
    yield* writeMeta('anon:runningSince', '0', nowDate)
    yield* writeMeta(`anon:requests:${today}`, String(meter.used), nowDate)
    yield* writeMeta('anon:lastRunAt', nowDate.toISOString(), nowDate)
    yield* writeMeta(key, JSON.stringify(history.slice(-7)), nowDate)
    yield* writeMeta(capKey, String(matchCap), nowDate)

    return {
      linked: plans.length,
      unresolved,
      ambiguous,
      tried: unresolvedRows.length,
      requests: meter.used,
      seeds,
      matchesFetched,
      coverage,
      matchCap,
    }
  })
