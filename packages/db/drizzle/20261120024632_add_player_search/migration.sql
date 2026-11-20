CREATE TABLE `player_search` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`puuid` text NOT NULL,
	`kind` text NOT NULL,
	`player_name_id` integer,
	`name` text NOT NULL,
	`tag` text NOT NULL,
	`name_folded` text NOT NULL,
	`tag_folded` text NOT NULL,
	`combined_folded` text NOT NULL,
	`ended_at` integer,
	CONSTRAINT `fk_player_search_puuid_players_puuid_fk` FOREIGN KEY (`puuid`) REFERENCES `players`(`puuid`) ON DELETE CASCADE,
	CONSTRAINT `fk_player_search_player_name_id_player_names_id_fk` FOREIGN KEY (`player_name_id`) REFERENCES `player_names`(`id`) ON DELETE CASCADE,
	CONSTRAINT "player_search_kind_check" CHECK("kind" IN ('current', 'past'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_search_current_idx` ON `player_search` (`puuid`) WHERE "player_search"."kind" = 'current';--> statement-breakpoint
CREATE UNIQUE INDEX `player_search_past_idx` ON `player_search` (`player_name_id`) WHERE "player_search"."kind" = 'past';--> statement-breakpoint
CREATE INDEX `player_search_puuid_idx` ON `player_search` (`puuid`);