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

export const SiteStats = Schema.Struct({
  totals: Schema.Struct({
    players: Schema.Finite,
    banned: Schema.Finite,
    anonymized: Schema.Finite,
    linked: Schema.Finite,
    unresolved: Schema.Finite,
    nameChanges: Schema.Finite,
    regionChanges: Schema.Finite,
    bans: Schema.Finite,
    unbans: Schema.Finite,
    runs: Schema.Finite,
  }),
  coverage: Schema.Struct({
    linked: Schema.Finite,
    unresolved: Schema.Finite,
    ratio: Schema.Finite,
  }),
  regions: Schema.Record(
    Schema.String,
    Schema.Struct({
      players: Schema.Finite,
      banned: Schema.Finite,
      linked: Schema.Finite,
      unresolved: Schema.Finite,
      averageRating: Schema.Finite,
      medianRating: Schema.Finite,
      topRating: Schema.Finite,
      totalWins: Schema.Finite,
      tiers: Schema.Record(Schema.String, Schema.Finite),
    }),
  ),
  recent: Schema.Struct({
    names: Schema.Array(
      Schema.Struct({
        puuid: Schema.String,
        name: Schema.String,
        tag: Schema.String,
        endedAt: Schema.Finite,
      }),
    ),
    regions: Schema.Array(
      Schema.Struct({
        puuid: Schema.String,
        name: Schema.NullOr(Schema.String),
        tag: Schema.NullOr(Schema.String),
        region: Region,
        endedAt: Schema.Finite,
      }),
    ),
    bans: Schema.Array(
      Schema.Struct({
        puuid: Schema.String,
        name: Schema.NullOr(Schema.String),
        tag: Schema.NullOr(Schema.String),
        endedAt: Schema.Finite,
      }),
    ),
  }),
  mostChanged: Schema.Array(
    Schema.Struct({
      puuid: Schema.String,
      name: Schema.NullOr(Schema.String),
      tag: Schema.NullOr(Schema.String),
      region: Schema.NullOr(Region),
      nameChanges: Schema.Finite,
      regionChanges: Schema.Finite,
    }),
  ),
  history: Schema.Array(
    Schema.Struct({
      at: Schema.Finite,
      players: Schema.Finite,
      nameChanges: Schema.Finite,
      regionChanges: Schema.Finite,
      bans: Schema.Finite,
      unbans: Schema.Finite,
      anonymous: Schema.Finite,
    }),
  ),
})

export type SiteStats = typeof SiteStats.Type

export const ServiceStatus = Schema.Struct({
  ok: Schema.Boolean,
  uptimeSeconds: Schema.Finite,
  database: Schema.Struct({
    ok: Schema.Boolean,
    path: Schema.String,
  }),
  index: Schema.Struct({
    version: Schema.Finite,
    players: Schema.Finite,
  }),
  season: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      endsAt: Schema.Finite,
    }),
  ),
  latestRun: Schema.NullOr(
    Schema.Struct({
      id: Schema.Finite,
      status: Schema.String,
      trigger: Schema.String,
      finishedAt: Schema.NullOr(Schema.Finite),
      durationMs: Schema.NullOr(Schema.Finite),
    }),
  ),
  recentRuns: Schema.Array(
    Schema.Struct({
      id: Schema.Finite,
      status: Schema.String,
      trigger: Schema.String,
      startedAt: Schema.Finite,
      finishedAt: Schema.NullOr(Schema.Finite),
      durationMs: Schema.NullOr(Schema.Finite),
    }),
  ),
  auth: Schema.Struct({
    cookieFile: Schema.String,
    updatedAt: Schema.NullOr(Schema.Finite),
  }),
  anonymous: Schema.Struct({
    total: Schema.Finite,
    unresolved: Schema.Finite,
    linked: Schema.Finite,
  }),
  lastBackupAt: Schema.NullOr(Schema.Finite),
  lastAnonRunAt: Schema.NullOr(Schema.Finite),
})

export type ServiceStatus = typeof ServiceStatus.Type

export const ApiError = Schema.Struct({
  error: Schema.Struct({
    code: Schema.String,
    message: Schema.String,
    requestId: Schema.String,
  }),
})

export type ApiError = typeof ApiError.Type

export const CrawlerMatch = Schema.Struct({
  matchId: Schema.String,
  region: Region,
  participants: Schema.Finite,
  gameStartAt: Schema.Finite,
  discoveredAt: Schema.Finite,
})

export type CrawlerMatch = typeof CrawlerMatch.Type

export const CrawlerSnapshot = Schema.Struct({
  running: Schema.Boolean,
  lastRunAt: Schema.NullOr(Schema.Finite),
  requestsToday: Schema.Finite,
  cache: Schema.Struct({
    matches: Schema.Finite,
    rows: Schema.Finite,
    byRegion: Schema.Record(Schema.String, Schema.Finite),
  }),
  schedule: Schema.Struct({
    nextRunAt: Schema.NullOr(Schema.Finite),
    message: Schema.NullOr(Schema.String),
  }),
  matches: Schema.Array(CrawlerMatch),
  activity: Schema.NullOr(
    Schema.Struct({
      phase: Schema.String,
      message: Schema.String,
      region: Schema.NullOr(Region),
      startedAt: Schema.Finite,
      seedsDone: Schema.Finite,
      seedsTotal: Schema.Finite,
      matchesFetched: Schema.Finite,
      requests: Schema.Finite,
      budget: Schema.Finite,
      linked: Schema.Finite,
      ambiguous: Schema.Finite,
      tried: Schema.Finite,
      limit: Schema.Finite,
      currentMatchId: Schema.NullOr(Schema.String),
      updatedAt: Schema.Finite,
    }),
  ),
})

export type CrawlerSnapshot = typeof CrawlerSnapshot.Type
