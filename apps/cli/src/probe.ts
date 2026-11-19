// @effect-diagnostics globalJsonInEffect:off
import {
  getActiveAct,
  getLeaderboard,
  getMatchDetails,
  getMatchHistory,
  getMmr,
  getNameService,
  getVersion,
  refreshSession,
  type AuthSession,
} from '@riotid/riot'
import { Effect } from 'effect'

const regions = ['na', 'eu', 'ap', 'kr'] as const

export type ProbeResult = {
  readonly regions: Record<string, number>
  readonly names: number
  readonly anonymized: number
}

const probeRegion = (
  session: AuthSession,
  clientVersion: string,
  seasonId: string,
  region: string,
) =>
  getLeaderboard(session, clientVersion, region, seasonId, 0, 10).pipe(
    Effect.map((leaderboard) => ({
      status: 200,
      totalPlayers: leaderboard.totalPlayers,
      players: leaderboard.Players.length,
    })),
    Effect.catchTag('RiotRequestError', (error) =>
      Effect.succeed({
        status: error.status ?? 0,
        error: error.message,
      }),
    ),
  )

export const runProbe = (cookieFile: string) =>
  Effect.gen(function* () {
    const session = yield* refreshSession(cookieFile)
    const version = yield* getVersion
    const act = yield* getActiveAct

    yield* Effect.logInfo(`auth region=${session.region} puuid_present=true`)
    yield* Effect.logInfo(
      `client=${version.riotClientVersion} act=${act.displayName} (${act.uuid})`,
    )

    const regionResults = yield* Effect.forEach(
      regions,
      (region) =>
        probeRegion(session, version.riotClientVersion, act.uuid, region).pipe(
          Effect.map((result) => [region, result] as const),
        ),
      { concurrency: 1 },
    )

    for (const [region, result] of regionResults) {
      yield* Effect.logInfo(`leaderboard ${region}: ${JSON.stringify(result)}`)
    }

    const page0 = yield* getLeaderboard(
      session,
      version.riotClientVersion,
      session.region,
      act.uuid,
      0,
      510,
    )
    const page1 = yield* getLeaderboard(
      session,
      version.riotClientVersion,
      session.region,
      act.uuid,
      510,
      510,
    )
    const puuids = [...page0.Players, ...page1.Players]
      .flatMap((player) => (player.puuid ? [player.puuid] : []))
      .slice(0, 1000)

    const names = yield* getNameService(session, version.riotClientVersion, session.region, puuids)

    yield* Effect.logInfo(
      `name-service batch=${puuids.length} returned=${names.length} first=${names[0]?.Subject === undefined ? 'none' : 'yes'}`,
    )

    const firstPuuid = puuids[0]

    if (firstPuuid) {
      const mmr = yield* getMmr(session, version.riotClientVersion, session.region, firstPuuid)
      const season = mmr.QueueSkills.competitive?.SeasonalInfoBySeasonID[act.uuid]

      yield* Effect.logInfo(
        `mmr fields leaderboardRank=${season?.LeaderboardRank ?? 'none'} rr=${season?.RankedRating ?? 'none'} wins=${season?.NumberOfWins ?? 'none'} tier=${season?.CompetitiveTier ?? 'none'}`,
      )

      const history = yield* getMatchHistory(
        session,
        version.riotClientVersion,
        session.region,
        firstPuuid,
        5,
      )
      const matchId = history.History[0]?.MatchID

      yield* Effect.logInfo(
        `match-history count=${history.History.length} match=${matchId ? 'yes' : 'none'}`,
      )

      if (matchId) {
        const details = yield* getMatchDetails(
          session,
          version.riotClientVersion,
          session.region,
          matchId,
        )
        const fields = details.players[0] ? Object.keys(details.players[0]) : []

        yield* Effect.logInfo(
          `match-details players=${details.players.length} fields=${fields.join(',')}`,
        )
      }
    }

    const anonymized: Array<Record<string, unknown>> = []
    let scanned = 0

    while (scanned < 2000 && anonymized.length === 0) {
      const page = yield* getLeaderboard(
        session,
        version.riotClientVersion,
        session.region,
        act.uuid,
        scanned,
        100,
      ).pipe(Effect.catchTag('RiotRequestError', () => Effect.succeed(null)))

      if (!page) {
        break
      }

      for (const player of page.Players) {
        if (player.IsAnonymized) {
          anonymized.push({
            rank: player.leaderboardRank,
            hasPuuid: (player.puuid?.length ?? 0) > 0,
            hasGameName: (player.gameName?.length ?? 0) > 0,
            hasTagLine: (player.tagLine?.length ?? 0) > 0,
            hasCard: player.PlayerCardID.length > 0,
            hasTitle: player.TitleID.length > 0,
            keys: Object.keys(player),
          })
        }
      }

      scanned += page.Players.length

      if (page.Players.length < 100) {
        break
      }
    }

    yield* Effect.logInfo(`anonymized scanned=${scanned} found=${anonymized.length}`)

    for (const row of anonymized.slice(0, 3)) {
      yield* Effect.logInfo(`anonymous ${JSON.stringify(row)}`)
    }

    const statuses = Object.fromEntries(
      regionResults.map(([region, result]) => [region, result.status]),
    )

    yield* Effect.logInfo(
      `probe summary: regions=${JSON.stringify(statuses)} names=${names.length} anonymized=${anonymized.length}`,
    )

    return { regions: statuses, names: names.length, anonymized: anonymized.length }
  }).pipe(
    Effect.catchTag('RiotRequestError', (error) =>
      Effect.logError(`probe failed: ${error.message} (status ${error.status ?? 'unknown'})`).pipe(
        Effect.as<ProbeResult>({ regions: {}, names: 0, anonymized: 0 }),
      ),
    ),
  )
