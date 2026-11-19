// @effect-diagnostics globalDate:off globalDateInEffect:off
import { Clock, Data, Effect, Schema } from 'effect'
import * as HttpClient from 'effect/http/HttpClient'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'

import type { AuthSession } from './auth.ts'

export const RIOT_CLIENT_PLATFORM =
  'ewoJInBsYXRmb3JtVHlwZSI6ICJQQyIsCgkicGxhdGZvcm1PUyI6ICJXaW5kb3dzIiwKCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjI2MjAwLjEuMjU2LjY0Yml0IiwKCSJwbGF0Zm9ybUNoaXBzZXQiOiAiVW5rbm93biIKfQ=='

export class RiotRequestError extends Data.TaggedError('RiotRequestError')<{
  readonly message: string
  readonly status?: number
}> {}

const VersionResponse = Schema.Struct({
  data: Schema.Struct({
    riotClientVersion: Schema.String,
  }),
})

const SeasonsResponse = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      uuid: Schema.String,
      displayName: Schema.String,
      type: Schema.optional(Schema.NullOr(Schema.String)),
      startTime: Schema.String,
      endTime: Schema.String,
    }),
  ),
})

export type Season = {
  readonly uuid: string
  readonly displayName: string
  readonly startsAt: Date
  readonly endsAt: Date
}

const LeaderboardPlayer = Schema.Struct({
  puuid: Schema.optional(Schema.String),
  gameName: Schema.optional(Schema.String),
  tagLine: Schema.optional(Schema.String),
  leaderboardRank: Schema.Finite,
  rankedRating: Schema.Finite,
  numberOfWins: Schema.Finite,
  competitiveTier: Schema.Finite,
  IsBanned: Schema.Boolean,
  IsAnonymized: Schema.Boolean,
  PlayerCardID: Schema.String,
  TitleID: Schema.String,
})

const LeaderboardResponse = Schema.Struct({
  SeasonID: Schema.String,
  totalPlayers: Schema.Finite,
  Players: Schema.Array(LeaderboardPlayer),
})

export type LeaderboardPlayer = typeof LeaderboardPlayer.Type
export type Leaderboard = typeof LeaderboardResponse.Type

const NameServiceResponse = Schema.Array(
  Schema.Struct({
    Subject: Schema.String,
    GameName: Schema.String,
    TagLine: Schema.String,
  }),
)

const MmrResponse = Schema.Struct({
  Subject: Schema.String,
  QueueSkills: Schema.Record(
    Schema.String,
    Schema.Struct({
      SeasonalInfoBySeasonID: Schema.Record(
        Schema.String,
        Schema.Struct({
          LeaderboardRank: Schema.Finite,
          RankedRating: Schema.Finite,
          NumberOfWins: Schema.Finite,
          CompetitiveTier: Schema.Finite,
        }),
      ),
    }),
  ),
})

const MatchHistoryResponse = Schema.Struct({
  History: Schema.Array(
    Schema.Struct({
      MatchID: Schema.String,
      GameStartTime: Schema.Finite,
      QueueID: Schema.String,
    }),
  ),
})

const MatchDetailsResponse = Schema.Struct({
  players: Schema.Array(
    Schema.Struct({
      subject: Schema.String,
      gameName: Schema.String,
      tagLine: Schema.String,
      playerCard: Schema.String,
      playerTitle: Schema.String,
      accountLevel: Schema.Finite,
      competitiveTier: Schema.Finite,
    }),
  ),
})

const authHeaders = (session: AuthSession, clientVersion: string): Record<string, string> => ({
  Authorization: `Bearer ${session.accessToken}`,
  'X-Riot-Entitlements-JWT': session.entitlementsToken,
  'X-Riot-ClientPlatform': RIOT_CLIENT_PLATFORM,
  'X-Riot-ClientVersion': clientVersion,
})

const requestJson = <S extends Schema.Constraint>(
  request: HttpClientRequest.HttpClientRequest,
  schema: S,
): Effect.Effect<S['Type'], RiotRequestError, HttpClient.HttpClient | S['DecodingServices']> =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(request).pipe(
      Effect.mapError(
        (error) =>
          new RiotRequestError({
            message: `Riot request failed: ${String(error)}`,
          }),
      ),
    )

    if (response.status < 200 || response.status >= 300) {
      const body = yield* response.text.pipe(Effect.orElseSucceed(() => ''))
      return yield* new RiotRequestError({
        message: `Riot request failed with HTTP ${response.status}: ${body.slice(0, 200)}`,
        status: response.status,
      })
    }

    const json = yield* response.json.pipe(
      Effect.mapError(
        (error) =>
          new RiotRequestError({
            message: `Riot response was not valid JSON: ${String(error)}`,
            status: response.status,
          }),
      ),
    )

    return yield* Schema.decodeUnknownEffect(schema)(json).pipe(
      Effect.mapError(
        () =>
          new RiotRequestError({
            message: 'Riot response did not match the expected schema.',
            status: response.status,
          }),
      ),
    )
  })

export const getVersion: Effect.Effect<
  { readonly riotClientVersion: string },
  RiotRequestError,
  HttpClient.HttpClient
> = Effect.gen(function* () {
  const response = yield* requestJson(
    HttpClientRequest.get('https://valorant-api.com/v1/version'),
    VersionResponse,
  )

  return { riotClientVersion: response.data.riotClientVersion }
})

export const getActiveAct: Effect.Effect<Season, RiotRequestError, HttpClient.HttpClient> =
  Effect.gen(function* () {
    const response = yield* requestJson(
      HttpClientRequest.get('https://valorant-api.com/v1/seasons'),
      SeasonsResponse,
    )
    const now = yield* Clock.currentTimeMillis
    const act = response.data.find(
      (season) =>
        season.type === 'EAresSeasonType::Act' &&
        Date.parse(season.startTime) <= now &&
        now <= Date.parse(season.endTime),
    )

    if (!act) {
      return yield* new RiotRequestError({
        message: 'No active competitive act was found.',
      })
    }

    return {
      uuid: act.uuid,
      displayName: act.displayName,
      startsAt: new Date(Date.parse(act.startTime)),
      endsAt: new Date(Date.parse(act.endTime)),
    }
  })

export const getLeaderboard = (
  session: AuthSession,
  clientVersion: string,
  region: string,
  seasonId: string,
  startIndex: number,
  size: number,
): Effect.Effect<Leaderboard, RiotRequestError, HttpClient.HttpClient> =>
  requestJson(
    HttpClientRequest.get(
      `https://pd.${region}.a.pvp.net/mmr/v1/leaderboards/affinity/${region}/queue/competitive/season/${seasonId}?startIndex=${startIndex}&size=${size}`,
      { headers: authHeaders(session, clientVersion) },
    ),
    LeaderboardResponse,
  )

export const getNameService = (
  session: AuthSession,
  clientVersion: string,
  shard: string,
  puuids: ReadonlyArray<string>,
): Effect.Effect<
  ReadonlyArray<{ Subject: string; GameName: string; TagLine: string }>,
  RiotRequestError,
  HttpClient.HttpClient
> =>
  requestJson(
    HttpClientRequest.bodyJsonUnsafe(
      HttpClientRequest.put(`https://pd.${shard}.a.pvp.net/name-service/v2/players`, {
        headers: authHeaders(session, clientVersion),
      }),
      puuids,
    ),
    NameServiceResponse,
  )

export const getMmr = (
  session: AuthSession,
  clientVersion: string,
  shard: string,
  puuid: string,
): Effect.Effect<typeof MmrResponse.Type, RiotRequestError, HttpClient.HttpClient> =>
  requestJson(
    HttpClientRequest.get(`https://pd.${shard}.a.pvp.net/mmr/v1/players/${puuid}`, {
      headers: authHeaders(session, clientVersion),
    }),
    MmrResponse,
  )

export const getMatchHistory = (
  session: AuthSession,
  clientVersion: string,
  shard: string,
  puuid: string,
  endIndex = 10,
): Effect.Effect<typeof MatchHistoryResponse.Type, RiotRequestError, HttpClient.HttpClient> =>
  requestJson(
    HttpClientRequest.get(
      `https://pd.${shard}.a.pvp.net/match-history/v1/history/${puuid}?startIndex=0&endIndex=${endIndex}&queue=competitive`,
      { headers: authHeaders(session, clientVersion) },
    ),
    MatchHistoryResponse,
  )

export const getMatchDetails = (
  session: AuthSession,
  clientVersion: string,
  shard: string,
  matchId: string,
): Effect.Effect<typeof MatchDetailsResponse.Type, RiotRequestError, HttpClient.HttpClient> =>
  requestJson(
    HttpClientRequest.get(`https://pd.${shard}.a.pvp.net/match-details/v1/matches/${matchId}`, {
      headers: authHeaders(session, clientVersion),
    }),
    MatchDetailsResponse,
  )
