CREATE TABLE `anonymous_rows` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`region` text NOT NULL,
	`season_id` text NOT NULL,
	`leaderboard_rank` integer NOT NULL,
	`ranked_rating` integer NOT NULL,
	`number_of_wins` integer NOT NULL,
	`competitive_tier` integer NOT NULL,
	`card_id` text NOT NULL,
	`title_id` text NOT NULL,
	`puuid` text,
	`resolved_puuid` text,
	`status` text DEFAULT 'unresolved' NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`last_tried_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT `fk_anonymous_rows_resolved_puuid_players_puuid_fk` FOREIGN KEY (`resolved_puuid`) REFERENCES `players`(`puuid`) ON DELETE SET NULL,
	CONSTRAINT "anonymous_rows_region_check" CHECK("region" IN ('na', 'eu', 'ap', 'kr')),
	CONSTRAINT "anonymous_rows_status_check" CHECK("status" IN ('unresolved', 'linked', 'ignored'))
);
--> statement-breakpoint
CREATE TABLE `banned_players` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`puuid` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`last_seen_at` integer NOT NULL,
	`started_run_id` integer,
	`ended_run_id` integer,
	`evidence` text DEFAULT 'leaderboard' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT `fk_banned_players_puuid_players_puuid_fk` FOREIGN KEY (`puuid`) REFERENCES `players`(`puuid`) ON DELETE CASCADE,
	CONSTRAINT `fk_banned_players_started_run_id_runs_id_fk` FOREIGN KEY (`started_run_id`) REFERENCES `runs`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_banned_players_ended_run_id_runs_id_fk` FOREIGN KEY (`ended_run_id`) REFERENCES `runs`(`id`) ON DELETE SET NULL,
	CONSTRAINT "banned_players_evidence_check" CHECK("evidence" = 'leaderboard'),
	CONSTRAINT "banned_players_interval_check" CHECK("ended_at" IS NULL OR "ended_at" >= "started_at")
);
--> statement-breakpoint
CREATE TABLE `identity_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`anonymous_row_id` integer NOT NULL,
	`puuid` text NOT NULL,
	`region` text NOT NULL,
	`season_id` text NOT NULL,
	`match_id` text,
	`method` text NOT NULL,
	`confidence` integer NOT NULL,
	`evidence` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT `fk_identity_links_anonymous_row_id_anonymous_rows_id_fk` FOREIGN KEY (`anonymous_row_id`) REFERENCES `anonymous_rows`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_identity_links_puuid_players_puuid_fk` FOREIGN KEY (`puuid`) REFERENCES `players`(`puuid`) ON DELETE CASCADE,
	CONSTRAINT "identity_links_region_check" CHECK("region" IN ('na', 'eu', 'ap', 'kr')),
	CONSTRAINT "identity_links_method_check" CHECK("method" IN ('direct_puuid', 'mmr_fingerprint', 'match_graph')),
	CONSTRAINT "identity_links_confidence_check" CHECK("confidence" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE `leaderboard_seeds` (
	`puuid` text PRIMARY KEY,
	`region` text NOT NULL,
	`season_id` text NOT NULL,
	`leaderboard_rank` integer NOT NULL,
	`ranked_rating` integer NOT NULL,
	`number_of_wins` integer NOT NULL,
	`competitive_tier` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT `fk_leaderboard_seeds_puuid_players_puuid_fk` FOREIGN KEY (`puuid`) REFERENCES `players`(`puuid`) ON DELETE CASCADE,
	CONSTRAINT "leaderboard_seeds_region_check" CHECK("region" IN ('na', 'eu', 'ap', 'kr'))
);
--> statement-breakpoint
CREATE TABLE `match_candidates` (
	`match_id` text NOT NULL,
	`puuid` text NOT NULL,
	`region` text NOT NULL,
	`game_start_at` integer NOT NULL,
	`card_id` text NOT NULL,
	`title_id` text NOT NULL,
	`account_level` integer NOT NULL,
	`competitive_tier` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT `match_candidates_pk` PRIMARY KEY(`match_id`, `puuid`),
	CONSTRAINT "match_candidates_region_check" CHECK("region" IN ('na', 'eu', 'ap', 'kr'))
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `player_names` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`puuid` text NOT NULL,
	`name` text NOT NULL,
	`tag` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`started_run_id` integer,
	`ended_run_id` integer,
	`source` text DEFAULT 'name_service' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT `fk_player_names_puuid_players_puuid_fk` FOREIGN KEY (`puuid`) REFERENCES `players`(`puuid`) ON DELETE CASCADE,
	CONSTRAINT `fk_player_names_started_run_id_runs_id_fk` FOREIGN KEY (`started_run_id`) REFERENCES `runs`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_player_names_ended_run_id_runs_id_fk` FOREIGN KEY (`ended_run_id`) REFERENCES `runs`(`id`) ON DELETE SET NULL,
	CONSTRAINT "player_names_source_check" CHECK("source" IN ('name_service', 'match_link')),
	CONSTRAINT "player_names_interval_check" CHECK("ended_at" IS NULL OR "ended_at" >= "started_at")
);
--> statement-breakpoint
CREATE TABLE `player_regions` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`puuid` text NOT NULL,
	`region` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`started_run_id` integer,
	`ended_run_id` integer,
	`evidence` text DEFAULT 'leaderboard' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT `fk_player_regions_puuid_players_puuid_fk` FOREIGN KEY (`puuid`) REFERENCES `players`(`puuid`) ON DELETE CASCADE,
	CONSTRAINT `fk_player_regions_started_run_id_runs_id_fk` FOREIGN KEY (`started_run_id`) REFERENCES `runs`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_player_regions_ended_run_id_runs_id_fk` FOREIGN KEY (`ended_run_id`) REFERENCES `runs`(`id`) ON DELETE SET NULL,
	CONSTRAINT "player_regions_region_check" CHECK("region" IN ('na', 'eu', 'ap', 'kr')),
	CONSTRAINT "player_regions_evidence_check" CHECK("evidence" IN ('leaderboard', 'mmr_probe')),
	CONSTRAINT "player_regions_interval_check" CHECK("ended_at" IS NULL OR "ended_at" >= "started_at")
);
--> statement-breakpoint
CREATE TABLE `players` (
	`puuid` text PRIMARY KEY,
	`name` text,
	`tag` text,
	`region` text,
	`is_banned` integer DEFAULT false NOT NULL,
	`is_anonymized` integer DEFAULT false NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`first_seen_run_id` integer,
	`last_seen_run_id` integer,
	`times_seen` integer DEFAULT 0 NOT NULL,
	`name_changes` integer DEFAULT 0 NOT NULL,
	`region_changes` integer DEFAULT 0 NOT NULL,
	`ban_count` integer DEFAULT 0 NOT NULL,
	`unban_count` integer DEFAULT 0 NOT NULL,
	`last_name_change_at` integer,
	`last_region_change_at` integer,
	`last_ban_at` integer,
	`last_unban_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT `fk_players_first_seen_run_id_runs_id_fk` FOREIGN KEY (`first_seen_run_id`) REFERENCES `runs`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_players_last_seen_run_id_runs_id_fk` FOREIGN KEY (`last_seen_run_id`) REFERENCES `runs`(`id`) ON DELETE SET NULL,
	CONSTRAINT "players_name_pair_check" CHECK(("name" IS NULL) = ("tag" IS NULL)),
	CONSTRAINT "players_region_check" CHECK("region" IS NULL OR "region" IN ('na', 'eu', 'ap', 'kr')),
	CONSTRAINT "players_counters_check" CHECK("times_seen" >= 0 AND "name_changes" >= 0 AND "region_changes" >= 0 AND "ban_count" >= 0 AND "unban_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE `run_regions` (
	`run_id` integer NOT NULL,
	`region` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`pages` integer DEFAULT 0 NOT NULL,
	`players` integer DEFAULT 0 NOT NULL,
	`page_overlaps` integer DEFAULT 0 NOT NULL,
	`cross_region_overlaps` integer DEFAULT 0 NOT NULL,
	`stale_names` integer DEFAULT 0 NOT NULL,
	`unresolved_names` integer DEFAULT 0 NOT NULL,
	`banned` integer DEFAULT 0 NOT NULL,
	`anonymized` integer DEFAULT 0 NOT NULL,
	`stats` text DEFAULT '{}' NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT `run_regions_pk` PRIMARY KEY(`run_id`, `region`),
	CONSTRAINT `fk_run_regions_run_id_runs_id_fk` FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON DELETE CASCADE,
	CONSTRAINT "run_regions_region_check" CHECK("region" IN ('na', 'eu', 'ap', 'kr')),
	CONSTRAINT "run_regions_status_check" CHECK("status" IN ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`status` text DEFAULT 'running' NOT NULL,
	`trigger` text NOT NULL,
	`season_id` text,
	`client_version` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`duration_ms` integer,
	`stats` text DEFAULT '{}' NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT `fk_runs_season_id_seasons_uuid_fk` FOREIGN KEY (`season_id`) REFERENCES `seasons`(`uuid`) ON DELETE SET NULL,
	CONSTRAINT "runs_status_check" CHECK("status" IN ('running', 'succeeded', 'failed')),
	CONSTRAINT "runs_trigger_check" CHECK("trigger" IN ('schedule', 'manual', 'boot'))
);
--> statement-breakpoint
CREATE TABLE `seasons` (
	`uuid` text PRIMARY KEY,
	`display_name` text NOT NULL,
	`type` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`parent_uuid` text,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `anonymous_rows_row_idx` ON `anonymous_rows` (`region`,`season_id`,`leaderboard_rank`);--> statement-breakpoint
CREATE INDEX `anonymous_rows_status_idx` ON `anonymous_rows` (`status`,`region`);--> statement-breakpoint
CREATE INDEX `anonymous_rows_queue_idx` ON `anonymous_rows` (`status`,`last_tried_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `banned_players_open_idx` ON `banned_players` (`puuid`) WHERE "banned_players"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX `banned_players_puuid_idx` ON `banned_players` (`puuid`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `identity_links_anonymous_idx` ON `identity_links` (`anonymous_row_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `identity_links_player_season_idx` ON `identity_links` (`puuid`,`season_id`);--> statement-breakpoint
CREATE INDEX `identity_links_puuid_idx` ON `identity_links` (`puuid`);--> statement-breakpoint
CREATE INDEX `leaderboard_seeds_lookup_idx` ON `leaderboard_seeds` (`region`,`season_id`,`leaderboard_rank`);--> statement-breakpoint
CREATE INDEX `match_candidates_lookup_idx` ON `match_candidates` (`region`,`competitive_tier`,`card_id`,`title_id`);--> statement-breakpoint
CREATE INDEX `match_candidates_puuid_idx` ON `match_candidates` (`puuid`);--> statement-breakpoint
CREATE INDEX `match_candidates_created_idx` ON `match_candidates` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `player_names_open_idx` ON `player_names` (`puuid`) WHERE "player_names"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX `player_names_puuid_idx` ON `player_names` (`puuid`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `player_regions_open_idx` ON `player_regions` (`puuid`) WHERE "player_regions"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX `player_regions_puuid_idx` ON `player_regions` (`puuid`,`started_at`);--> statement-breakpoint
CREATE INDEX `players_region_idx` ON `players` (`region`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `players_last_seen_idx` ON `players` (`last_seen_at`);--> statement-breakpoint
CREATE INDEX `players_name_idx` ON `players` (`name`);--> statement-breakpoint
CREATE INDEX `run_regions_region_idx` ON `run_regions` (`region`,`status`);--> statement-breakpoint
CREATE INDEX `runs_started_idx` ON `runs` (`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `runs_running_idx` ON `runs` (`status`) WHERE "runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX `seasons_active_idx` ON `seasons` (`is_active`,`ends_at`);