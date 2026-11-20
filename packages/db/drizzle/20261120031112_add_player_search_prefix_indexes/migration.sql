CREATE INDEX `player_search_name_idx` ON `player_search` (`name_folded`);--> statement-breakpoint
CREATE INDEX `player_search_tag_idx` ON `player_search` (`tag_folded`);--> statement-breakpoint
CREATE INDEX `player_search_combined_idx` ON `player_search` (`combined_folded`);