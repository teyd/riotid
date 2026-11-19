DROP INDEX IF EXISTS `match_candidates_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `match_candidates_puuid_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `players_region_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `players_last_seen_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `players_name_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `identity_links_puuid_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `run_regions_region_idx`;--> statement-breakpoint
CREATE INDEX `match_candidates_fingerprint_idx` ON `match_candidates` (`region`,`competitive_tier`,`card_id`,`title_id`,`game_start_at`);--> statement-breakpoint
CREATE INDEX `match_candidates_player_idx` ON `match_candidates` (`puuid`,`game_start_at`);--> statement-breakpoint
CREATE INDEX `players_region_public_idx` ON `players` (`region`,`last_seen_at`) WHERE "players"."is_banned" = 0;--> statement-breakpoint
CREATE INDEX `players_public_last_seen_idx` ON `players` (`last_seen_at`,`puuid`) WHERE "players"."is_banned" = 0;--> statement-breakpoint
CREATE INDEX `runs_succeeded_finished_idx` ON `runs` (`finished_at`) WHERE "runs"."status" = 'succeeded';