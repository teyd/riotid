DROP TRIGGER IF EXISTS `player_search_fts_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `player_search_fts_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `player_search_fts_update`;
--> statement-breakpoint
DROP TABLE IF EXISTS `player_search_fts`;
--> statement-breakpoint
CREATE VIRTUAL TABLE `player_search_fts` USING fts5(
	`kind`,
	`name_folded`,
	`tag_folded`,
	`combined_folded`,
	content='player_search',
	content_rowid='id',
	tokenize='trigram'
);
--> statement-breakpoint
CREATE TRIGGER `player_search_fts_insert`
AFTER INSERT ON `player_search`
BEGIN
	INSERT INTO `player_search_fts` (`rowid`, `kind`, `name_folded`, `tag_folded`, `combined_folded`)
	VALUES (new.`id`, new.`kind`, new.`name_folded`, new.`tag_folded`, new.`combined_folded`);
END;
--> statement-breakpoint
CREATE TRIGGER `player_search_fts_delete`
AFTER DELETE ON `player_search`
BEGIN
	INSERT INTO `player_search_fts` (`player_search_fts`, `rowid`, `kind`, `name_folded`, `tag_folded`, `combined_folded`)
	VALUES ('delete', old.`id`, old.`kind`, old.`name_folded`, old.`tag_folded`, old.`combined_folded`);
END;
--> statement-breakpoint
CREATE TRIGGER `player_search_fts_update`
AFTER UPDATE ON `player_search`
BEGIN
	INSERT INTO `player_search_fts` (`player_search_fts`, `rowid`, `kind`, `name_folded`, `tag_folded`, `combined_folded`)
	VALUES ('delete', old.`id`, old.`kind`, old.`name_folded`, old.`tag_folded`, old.`combined_folded`);
	INSERT INTO `player_search_fts` (`rowid`, `kind`, `name_folded`, `tag_folded`, `combined_folded`)
	VALUES (new.`id`, new.`kind`, new.`name_folded`, new.`tag_folded`, new.`combined_folded`);
END;
--> statement-breakpoint
INSERT INTO `player_search_fts` (`player_search_fts`) VALUES ('rebuild');
--> statement-breakpoint
INSERT INTO `player_search_fts` (`player_search_fts`) VALUES ('optimize');
