import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

const regions = ['na', 'eu', 'ap', 'kr'] as const
const runStatuses = ['running', 'succeeded', 'failed'] as const
const runTriggers = ['schedule', 'manual', 'boot'] as const
const nameSources = ['name_service', 'match_link'] as const
const regionEvidence = ['leaderboard', 'mmr_probe'] as const
const anonymousStatuses = ['unresolved', 'linked', 'ignored'] as const
const identityMethods = ['direct_puuid', 'mmr_fingerprint', 'match_graph'] as const
const searchKinds = ['current', 'past'] as const

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
}

export const seasons = sqliteTable(
  'seasons',
  {
    uuid: text('uuid').primaryKey(),
    displayName: text('display_name').notNull(),
    type: text('type'),
    startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
    endsAt: integer('ends_at', { mode: 'timestamp_ms' }).notNull(),
    parentUuid: text('parent_uuid'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (table) => [index('seasons_active_idx').on(table.isActive, table.endsAt)],
)

export const runs = sqliteTable(
  'runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    status: text('status', { enum: runStatuses }).notNull().default('running'),
    trigger: text('trigger', { enum: runTriggers }).notNull(),
    seasonId: text('season_id').references(() => seasons.uuid, { onDelete: 'set null' }),
    clientVersion: text('client_version').notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    durationMs: integer('duration_ms'),
    stats: text('stats', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    error: text('error'),
    ...timestamps,
  },
  (table) => [
    check('runs_status_check', sql`${table.status} IN ('running', 'succeeded', 'failed')`),
    check('runs_trigger_check', sql`${table.trigger} IN ('schedule', 'manual', 'boot')`),
    index('runs_started_idx').on(table.startedAt),
    index('runs_succeeded_finished_idx')
      .on(table.finishedAt)
      .where(sql`${table.status} = 'succeeded'`),
    uniqueIndex('runs_running_idx')
      .on(table.status)
      .where(sql`${table.status} = 'running'`),
  ],
)

export const runRegions = sqliteTable(
  'run_regions',
  {
    runId: integer('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    region: text('region', { enum: regions }).notNull(),
    status: text('status', { enum: runStatuses }).notNull().default('running'),
    pages: integer('pages').notNull().default(0),
    players: integer('players').notNull().default(0),
    pageOverlaps: integer('page_overlaps').notNull().default(0),
    crossRegionOverlaps: integer('cross_region_overlaps').notNull().default(0),
    staleNames: integer('stale_names').notNull().default(0),
    unresolvedNames: integer('unresolved_names').notNull().default(0),
    banned: integer('banned').notNull().default(0),
    anonymized: integer('anonymized').notNull().default(0),
    stats: text('stats', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    error: text('error'),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.region] }),
    check('run_regions_region_check', sql`${table.region} IN ('na', 'eu', 'ap', 'kr')`),
    check('run_regions_status_check', sql`${table.status} IN ('running', 'succeeded', 'failed')`),
  ],
)

export const players = sqliteTable(
  'players',
  {
    puuid: text('puuid').primaryKey(),
    name: text('name'),
    tag: text('tag'),
    cardId: text('card_id'),
    region: text('region', { enum: regions }),
    isBanned: integer('is_banned', { mode: 'boolean' }).notNull().default(false),
    isAnonymized: integer('is_anonymized', { mode: 'boolean' }).notNull().default(false),
    firstSeenAt: integer('first_seen_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    firstSeenRunId: integer('first_seen_run_id').references(() => runs.id, {
      onDelete: 'set null',
    }),
    lastSeenRunId: integer('last_seen_run_id').references(() => runs.id, {
      onDelete: 'set null',
    }),
    timesSeen: integer('times_seen').notNull().default(0),
    nameChanges: integer('name_changes').notNull().default(0),
    regionChanges: integer('region_changes').notNull().default(0),
    banCount: integer('ban_count').notNull().default(0),
    unbanCount: integer('unban_count').notNull().default(0),
    lastNameChangeAt: integer('last_name_change_at', { mode: 'timestamp_ms' }),
    lastRegionChangeAt: integer('last_region_change_at', { mode: 'timestamp_ms' }),
    lastBanAt: integer('last_ban_at', { mode: 'timestamp_ms' }),
    lastUnbanAt: integer('last_unban_at', { mode: 'timestamp_ms' }),
    ...timestamps,
  },
  (table) => [
    check('players_name_pair_check', sql`(${table.name} IS NULL) = (${table.tag} IS NULL)`),
    check(
      'players_region_check',
      sql`${table.region} IS NULL OR ${table.region} IN ('na', 'eu', 'ap', 'kr')`,
    ),
    check(
      'players_counters_check',
      sql`${table.timesSeen} >= 0 AND ${table.nameChanges} >= 0 AND ${table.regionChanges} >= 0 AND ${table.banCount} >= 0 AND ${table.unbanCount} >= 0`,
    ),
    index('players_region_public_idx')
      .on(table.region, table.lastSeenAt)
      .where(sql`${table.isBanned} = 0`),
    index('players_public_last_seen_idx')
      .on(table.lastSeenAt, table.puuid)
      .where(sql`${table.isBanned} = 0`),
  ],
)

export const playerNames = sqliteTable(
  'player_names',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    puuid: text('puuid')
      .notNull()
      .references(() => players.puuid, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tag: text('tag').notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
    startedRunId: integer('started_run_id').references(() => runs.id, { onDelete: 'set null' }),
    endedRunId: integer('ended_run_id').references(() => runs.id, { onDelete: 'set null' }),
    source: text('source', { enum: nameSources }).notNull().default('name_service'),
    ...timestamps,
  },
  (table) => [
    check('player_names_source_check', sql`${table.source} IN ('name_service', 'match_link')`),
    check(
      'player_names_interval_check',
      sql`${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.startedAt}`,
    ),
    uniqueIndex('player_names_open_idx')
      .on(table.puuid)
      .where(sql`${table.endedAt} IS NULL`),
    index('player_names_puuid_idx').on(table.puuid, table.startedAt),
  ],
)

export const playerSearch = sqliteTable(
  'player_search',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    puuid: text('puuid')
      .notNull()
      .references(() => players.puuid, { onDelete: 'cascade' }),
    kind: text('kind', { enum: searchKinds }).notNull(),
    playerNameId: integer('player_name_id').references(() => playerNames.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    tag: text('tag').notNull(),
    nameFolded: text('name_folded').notNull(),
    tagFolded: text('tag_folded').notNull(),
    combinedFolded: text('combined_folded').notNull(),
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    check('player_search_kind_check', sql`${table.kind} IN ('current', 'past')`),
    uniqueIndex('player_search_current_idx')
      .on(table.puuid)
      .where(sql`${table.kind} = 'current'`),
    uniqueIndex('player_search_past_idx')
      .on(table.playerNameId)
      .where(sql`${table.kind} = 'past'`),
    index('player_search_puuid_idx').on(table.puuid),
  ],
)

export const playerRegions = sqliteTable(
  'player_regions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    puuid: text('puuid')
      .notNull()
      .references(() => players.puuid, { onDelete: 'cascade' }),
    region: text('region', { enum: regions }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
    startedRunId: integer('started_run_id').references(() => runs.id, { onDelete: 'set null' }),
    endedRunId: integer('ended_run_id').references(() => runs.id, { onDelete: 'set null' }),
    evidence: text('evidence', { enum: regionEvidence }).notNull().default('leaderboard'),
    ...timestamps,
  },
  (table) => [
    check('player_regions_region_check', sql`${table.region} IN ('na', 'eu', 'ap', 'kr')`),
    check('player_regions_evidence_check', sql`${table.evidence} IN ('leaderboard', 'mmr_probe')`),
    check(
      'player_regions_interval_check',
      sql`${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.startedAt}`,
    ),
    uniqueIndex('player_regions_open_idx')
      .on(table.puuid)
      .where(sql`${table.endedAt} IS NULL`),
    index('player_regions_puuid_idx').on(table.puuid, table.startedAt),
  ],
)

export const bannedPlayers = sqliteTable(
  'banned_players',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    puuid: text('puuid')
      .notNull()
      .references(() => players.puuid, { onDelete: 'cascade' }),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    startedRunId: integer('started_run_id').references(() => runs.id, { onDelete: 'set null' }),
    endedRunId: integer('ended_run_id').references(() => runs.id, { onDelete: 'set null' }),
    evidence: text('evidence', { enum: ['leaderboard'] })
      .notNull()
      .default('leaderboard'),
    ...timestamps,
  },
  (table) => [
    check('banned_players_evidence_check', sql`${table.evidence} = 'leaderboard'`),
    check(
      'banned_players_interval_check',
      sql`${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.startedAt}`,
    ),
    uniqueIndex('banned_players_open_idx')
      .on(table.puuid)
      .where(sql`${table.endedAt} IS NULL`),
    index('banned_players_puuid_idx').on(table.puuid, table.startedAt),
  ],
)

export const leaderboardSeeds = sqliteTable(
  'leaderboard_seeds',
  {
    puuid: text('puuid')
      .primaryKey()
      .references(() => players.puuid, { onDelete: 'cascade' }),
    region: text('region', { enum: regions }).notNull(),
    seasonId: text('season_id').notNull(),
    leaderboardRank: integer('leaderboard_rank').notNull(),
    rankedRating: integer('ranked_rating').notNull(),
    numberOfWins: integer('number_of_wins').notNull(),
    competitiveTier: integer('competitive_tier').notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    ...timestamps,
  },
  (table) => [
    check('leaderboard_seeds_region_check', sql`${table.region} IN ('na', 'eu', 'ap', 'kr')`),
    index('leaderboard_seeds_lookup_idx').on(table.region, table.seasonId, table.leaderboardRank),
  ],
)

export const anonymousRows = sqliteTable(
  'anonymous_rows',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    region: text('region', { enum: regions }).notNull(),
    seasonId: text('season_id').notNull(),
    leaderboardRank: integer('leaderboard_rank').notNull(),
    rankedRating: integer('ranked_rating').notNull(),
    numberOfWins: integer('number_of_wins').notNull(),
    competitiveTier: integer('competitive_tier').notNull(),
    cardId: text('card_id').notNull(),
    titleId: text('title_id').notNull(),
    puuid: text('puuid'),
    resolvedPuuid: text('resolved_puuid').references(() => players.puuid, {
      onDelete: 'set null',
    }),
    status: text('status', { enum: anonymousStatuses }).notNull().default('unresolved'),
    firstSeenAt: integer('first_seen_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    lastTriedAt: integer('last_tried_at', { mode: 'timestamp_ms' }),
    ...timestamps,
  },
  (table) => [
    check('anonymous_rows_region_check', sql`${table.region} IN ('na', 'eu', 'ap', 'kr')`),
    check(
      'anonymous_rows_status_check',
      sql`${table.status} IN ('unresolved', 'linked', 'ignored')`,
    ),
    uniqueIndex('anonymous_rows_row_idx').on(table.region, table.seasonId, table.leaderboardRank),
    index('anonymous_rows_status_idx').on(table.status, table.region),
    index('anonymous_rows_queue_idx').on(table.status, table.lastTriedAt),
  ],
)

export const identityLinks = sqliteTable(
  'identity_links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    anonymousRowId: integer('anonymous_row_id')
      .notNull()
      .references(() => anonymousRows.id, { onDelete: 'cascade' }),
    puuid: text('puuid')
      .notNull()
      .references(() => players.puuid, { onDelete: 'cascade' }),
    region: text('region', { enum: regions }).notNull(),
    seasonId: text('season_id').notNull(),
    matchId: text('match_id'),
    method: text('method', { enum: identityMethods }).notNull(),
    confidence: integer('confidence').notNull(),
    evidence: text('evidence', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    ...timestamps,
  },
  (table) => [
    check('identity_links_region_check', sql`${table.region} IN ('na', 'eu', 'ap', 'kr')`),
    check(
      'identity_links_method_check',
      sql`${table.method} IN ('direct_puuid', 'mmr_fingerprint', 'match_graph')`,
    ),
    check('identity_links_confidence_check', sql`${table.confidence} BETWEEN 0 AND 10000`),
    uniqueIndex('identity_links_anonymous_idx').on(table.anonymousRowId),
    uniqueIndex('identity_links_player_season_idx').on(table.puuid, table.seasonId),
  ],
)

export const matchCandidates = sqliteTable(
  'match_candidates',
  {
    matchId: text('match_id').notNull(),
    puuid: text('puuid').notNull(),
    region: text('region', { enum: regions }).notNull(),
    gameStartAt: integer('game_start_at', { mode: 'timestamp_ms' }).notNull(),
    cardId: text('card_id').notNull(),
    titleId: text('title_id').notNull(),
    accountLevel: integer('account_level').notNull(),
    competitiveTier: integer('competitive_tier').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.matchId, table.puuid] }),
    check('match_candidates_region_check', sql`${table.region} IN ('na', 'eu', 'ap', 'kr')`),
    index('match_candidates_fingerprint_idx').on(
      table.region,
      table.competitiveTier,
      table.cardId,
      table.titleId,
      table.gameStartAt,
    ),
    index('match_candidates_player_idx').on(table.puuid, table.gameStartAt),
    index('match_candidates_created_idx').on(table.createdAt),
  ],
)

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

export type Player = typeof players.$inferSelect
export type NewPlayer = typeof players.$inferInsert
export type PlayerName = typeof playerNames.$inferSelect
export type PlayerRegion = typeof playerRegions.$inferSelect
export type BannedPlayer = typeof bannedPlayers.$inferSelect
export type AnonymousRow = typeof anonymousRows.$inferSelect
export type LeaderboardSeed = typeof leaderboardSeeds.$inferSelect
export type IdentityLink = typeof identityLinks.$inferSelect
export type MatchCandidate = typeof matchCandidates.$inferSelect
export type Run = typeof runs.$inferSelect
export type RunRegion = typeof runRegions.$inferSelect
export type Season = typeof seasons.$inferSelect
