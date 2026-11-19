import {
  getActiveAct,
  getLeaderboard,
  getNameService,
  getVersion,
  type AuthSession,
  type Leaderboard,
  type RiotRequestError,
  type Season,
} from '@riotid/riot'
import { Context, Effect, Layer } from 'effect'
import * as HttpClient from 'effect/http/HttpClient'

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
    }
  }),
)
