import { Context, Effect, Layer } from 'effect'
import * as HttpClient from 'effect/http/HttpClient'

import type { RiotRequestError } from './valorant.ts'
import {
  getActiveAct,
  getLeaderboard,
  getMatchDetails,
  getMatchHistory,
  getMmr,
  getNameService,
  getVersion,
  type Leaderboard,
  type LeaderboardPlayer,
  type Season,
} from './valorant.ts'
import type { AuthSession } from './auth.ts'

export type RiotSourceShape = {
  getVersion: Effect.Effect<{ riotClientVersion: string }, RiotRequestError>
  getActiveAct: Effect.Effect<Season, RiotRequestError>
  getLeaderboard: (
    session: AuthSession,
    clientVersion: string,
    region: string,
    seasonId: string,
    startIndex: number,
    size: number,
  ) => Effect.Effect<Leaderboard, RiotRequestError>
  getNameService: (
    session: AuthSession,
    clientVersion: string,
    shard: string,
    puuids: ReadonlyArray<string>,
  ) => Effect.Effect<
    ReadonlyArray<{ Subject: string; GameName: string; TagLine: string }>,
    RiotRequestError
  >
  getMmr: (
    session: AuthSession,
    clientVersion: string,
    shard: string,
    puuid: string,
  ) => Effect.Effect<Mmr, RiotRequestError>
  getMatchHistory: (
    session: AuthSession,
    clientVersion: string,
    shard: string,
    puuid: string,
  ) => Effect.Effect<MatchHistory, RiotRequestError>
  getMatchDetails: (
    session: AuthSession,
    clientVersion: string,
    shard: string,
    matchId: string,
  ) => Effect.Effect<MatchDetails, RiotRequestError>
}

export type Mmr = {
  readonly Subject: string
  readonly QueueSkills: Record<
    string,
    {
      readonly SeasonalInfoBySeasonID: Record<
        string,
        {
          readonly LeaderboardRank: number
          readonly RankedRating: number
          readonly NumberOfWins: number
          readonly CompetitiveTier: number
        }
      >
    }
  >
}

export type MatchHistory = {
  readonly History: ReadonlyArray<{
    readonly MatchID: string
    readonly GameStartTime: number
    readonly QueueID: string
  }>
}

export type MatchDetails = {
  readonly players: ReadonlyArray<{
    readonly subject: string
    readonly gameName: string
    readonly tagLine: string
    readonly playerCard: string
    readonly playerTitle: string
    readonly accountLevel: number
    readonly competitiveTier: number
  }>
}

export class RiotSource extends Context.Service<RiotSource, RiotSourceShape>()('RiotSource') {}

export const RiotSourceLive: Layer.Layer<RiotSource, never, HttpClient.HttpClient> = Layer.effect(
  RiotSource,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient

    const provide = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
      effect.pipe(Effect.provideService(HttpClient.HttpClient, client))

    return {
      getVersion: provide(getVersion),
      getActiveAct: provide(getActiveAct),
      getLeaderboard: (session, clientVersion, region, seasonId, startIndex, size) =>
        provide(getLeaderboard(session, clientVersion, region, seasonId, startIndex, size)),
      getNameService: (session, clientVersion, shard, puuids) =>
        provide(getNameService(session, clientVersion, shard, puuids)),
      getMmr: (session, clientVersion, shard, puuid) =>
        provide(getMmr(session, clientVersion, shard, puuid)),
      getMatchHistory: (session, clientVersion, shard, puuid) =>
        provide(getMatchHistory(session, clientVersion, shard, puuid)),
      getMatchDetails: (session, clientVersion, shard, matchId) =>
        provide(getMatchDetails(session, clientVersion, shard, matchId)),
    }
  }),
)

export type LeaderboardPlayerRow = LeaderboardPlayer
