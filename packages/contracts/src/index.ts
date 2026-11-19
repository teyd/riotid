import { Schema } from 'effect'

export const Health = Schema.Struct({
  ok: Schema.Boolean,
  service: Schema.String,
})

export type Health = typeof Health.Type

export const Region = Schema.Literals(['na', 'eu', 'ap', 'kr'])
export type Region = typeof Region.Type

export const IndexFlags = {
  anonymized: 1,
  nameChange: 2,
  regionChange: 4,
  banHistory: 8,
  unbanHistory: 16,
} as const

export const IndexPlayer = Schema.Tuple([
  Schema.String,
  Schema.String,
  Schema.String,
  Schema.NullOr(Region),
  Schema.Finite,
  Schema.Finite,
  Schema.Finite,
  Schema.Finite,
  Schema.Finite,
  Schema.NullOr(Schema.Finite),
  Schema.NullOr(Schema.Finite),
])

export type IndexPlayer = typeof IndexPlayer.Type

export const IndexSeason = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  endsAt: Schema.Finite,
})

export const IndexStats = Schema.Struct({
  players: Schema.Finite,
  nameChanges: Schema.Finite,
  regionChanges: Schema.Finite,
  bans: Schema.Finite,
  unbans: Schema.Finite,
  anonymous: Schema.Finite,
  linked: Schema.Finite,
  unresolved: Schema.Finite,
  lastRunAt: Schema.NullOr(Schema.Finite),
})

export const SiteIndex = Schema.Struct({
  version: Schema.Finite,
  generatedAt: Schema.Finite,
  season: Schema.NullOr(IndexSeason),
  stats: IndexStats,
  cards: Schema.Array(Schema.String),
  players: Schema.Array(IndexPlayer),
})

export type SiteIndex = typeof SiteIndex.Type

export const NameInterval = Schema.Struct({
  name: Schema.String,
  tag: Schema.String,
  startedAt: Schema.Finite,
  endedAt: Schema.NullOr(Schema.Finite),
  startedRunId: Schema.NullOr(Schema.Finite),
  endedRunId: Schema.NullOr(Schema.Finite),
})

export const RegionInterval = Schema.Struct({
  region: Region,
  startedAt: Schema.Finite,
  endedAt: Schema.NullOr(Schema.Finite),
  startedRunId: Schema.NullOr(Schema.Finite),
  endedRunId: Schema.NullOr(Schema.Finite),
})

export const BanInterval = Schema.Struct({
  startedAt: Schema.Finite,
  endedAt: Schema.NullOr(Schema.Finite),
  lastSeenAt: Schema.Finite,
  startedRunId: Schema.NullOr(Schema.Finite),
  endedRunId: Schema.NullOr(Schema.Finite),
})

export const IdentityEvidence = Schema.Struct({
  matchId: Schema.NullOr(Schema.String),
  method: Schema.Literals(['direct_puuid', 'mmr_fingerprint', 'match_graph']),
  confidence: Schema.Finite,
  evidence: Schema.Record(Schema.String, Schema.Unknown),
  createdAt: Schema.Finite,
  anonymous: Schema.Struct({
    region: Region,
    leaderboardRank: Schema.Finite,
    rankedRating: Schema.Finite,
    numberOfWins: Schema.Finite,
    competitiveTier: Schema.Finite,
    seasonId: Schema.String,
    seasonName: Schema.NullOr(Schema.String),
    cardId: Schema.String,
    titleId: Schema.String,
  }),
})

export const PlayerDetail = Schema.Struct({
  player: Schema.Struct({
    puuid: Schema.String,
    name: Schema.NullOr(Schema.String),
    tag: Schema.NullOr(Schema.String),
    cardId: Schema.NullOr(Schema.String),
    region: Schema.NullOr(Region),
    isBanned: Schema.Boolean,
    isAnonymized: Schema.Boolean,
    firstSeenAt: Schema.Finite,
    lastSeenAt: Schema.Finite,
    firstSeenRunId: Schema.NullOr(Schema.Finite),
    lastSeenRunId: Schema.NullOr(Schema.Finite),
    timesSeen: Schema.Finite,
    nameChanges: Schema.Finite,
    regionChanges: Schema.Finite,
    banCount: Schema.Finite,
    unbanCount: Schema.Finite,
    lastNameChangeAt: Schema.NullOr(Schema.Finite),
    lastRegionChangeAt: Schema.NullOr(Schema.Finite),
    lastBanAt: Schema.NullOr(Schema.Finite),
    lastUnbanAt: Schema.NullOr(Schema.Finite),
  }),
  names: Schema.Array(NameInterval),
  regions: Schema.Array(RegionInterval),
  bans: Schema.Array(BanInterval),
  links: Schema.Array(IdentityEvidence),
})

export type PlayerDetail = typeof PlayerDetail.Type

export const ApiError = Schema.Struct({
  error: Schema.Struct({
    code: Schema.String,
    message: Schema.String,
    requestId: Schema.String,
  }),
})

export type ApiError = typeof ApiError.Type
