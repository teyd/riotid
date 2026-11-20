CREATE VIRTUAL TABLE `player_search_fts` USING fts5(
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
	INSERT INTO `player_search_fts` (`rowid`, `name_folded`, `tag_folded`, `combined_folded`)
	VALUES (new.`id`, new.`name_folded`, new.`tag_folded`, new.`combined_folded`);
END;
--> statement-breakpoint
CREATE TRIGGER `player_search_fts_delete`
AFTER DELETE ON `player_search`
BEGIN
	INSERT INTO `player_search_fts` (`player_search_fts`, `rowid`, `name_folded`, `tag_folded`, `combined_folded`)
	VALUES ('delete', old.`id`, old.`name_folded`, old.`tag_folded`, old.`combined_folded`);
END;
--> statement-breakpoint
CREATE TRIGGER `player_search_fts_update`
AFTER UPDATE ON `player_search`
BEGIN
	INSERT INTO `player_search_fts` (`player_search_fts`, `rowid`, `name_folded`, `tag_folded`, `combined_folded`)
	VALUES ('delete', old.`id`, old.`name_folded`, old.`tag_folded`, old.`combined_folded`);
	INSERT INTO `player_search_fts` (`rowid`, `name_folded`, `tag_folded`, `combined_folded`)
	VALUES (new.`id`, new.`name_folded`, new.`tag_folded`, new.`combined_folded`);
END;
--> statement-breakpoint
CREATE TRIGGER `player_search_current_insert`
AFTER INSERT ON `players`
WHEN new.`name` IS NOT NULL AND new.`name` <> '' AND new.`tag` IS NOT NULL
BEGIN
	INSERT INTO `player_search` (`puuid`, `kind`, `name`, `tag`, `name_folded`, `tag_folded`, `combined_folded`)
	VALUES (new.`puuid`, 'current', new.`name`, new.`tag`, lower(new.`name`), lower(new.`tag`), lower(new.`name` || '#' || new.`tag`));
END;
--> statement-breakpoint
CREATE TRIGGER `player_search_current_update`
AFTER UPDATE OF `name`, `tag`, `puuid` ON `players`
BEGIN
	DELETE FROM `player_search` WHERE `puuid` = old.`puuid` AND `kind` = 'current';
	INSERT INTO `player_search` (`puuid`, `kind`, `name`, `tag`, `name_folded`, `tag_folded`, `combined_folded`)
	SELECT new.`puuid`, 'current', new.`name`, new.`tag`, lower(new.`name`), lower(new.`tag`), lower(new.`name` || '#' || new.`tag`)
	WHERE new.`name` IS NOT NULL AND new.`name` <> '' AND new.`tag` IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `player_search_past_insert`
AFTER INSERT ON `player_names`
WHEN new.`ended_at` IS NOT NULL
BEGIN
	INSERT INTO `player_search` (`puuid`, `kind`, `player_name_id`, `name`, `tag`, `name_folded`, `tag_folded`, `combined_folded`, `ended_at`)
	VALUES (new.`puuid`, 'past', new.`id`, new.`name`, new.`tag`, lower(new.`name`), lower(new.`tag`), lower(new.`name` || '#' || new.`tag`), new.`ended_at`);
END;
--> statement-breakpoint
CREATE TRIGGER `player_search_past_update`
AFTER UPDATE OF `name`, `tag`, `ended_at`, `puuid` ON `player_names`
BEGIN
	DELETE FROM `player_search` WHERE `kind` = 'past' AND `player_name_id` = old.`id`;
	INSERT INTO `player_search` (`puuid`, `kind`, `player_name_id`, `name`, `tag`, `name_folded`, `tag_folded`, `combined_folded`, `ended_at`)
	SELECT new.`puuid`, 'past', new.`id`, new.`name`, new.`tag`, lower(new.`name`), lower(new.`tag`), lower(new.`name` || '#' || new.`tag`), new.`ended_at`
	WHERE new.`ended_at` IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `player_search_past_delete`
AFTER DELETE ON `player_names`
BEGIN
	DELETE FROM `player_search` WHERE `kind` = 'past' AND `player_name_id` = old.`id`;
END;
--> statement-breakpoint
INSERT INTO `player_search` (`puuid`, `kind`, `name`, `tag`, `name_folded`, `tag_folded`, `combined_folded`)
SELECT `puuid`, 'current', `name`, `tag`, lower(`name`), lower(`tag`), lower(`name` || '#' || `tag`)
FROM `players`
WHERE `name` IS NOT NULL AND `name` <> '' AND `tag` IS NOT NULL;
--> statement-breakpoint
INSERT INTO `player_search` (`puuid`, `kind`, `player_name_id`, `name`, `tag`, `name_folded`, `tag_folded`, `combined_folded`, `ended_at`)
SELECT `puuid`, 'past', `id`, `name`, `tag`, lower(`name`), lower(`tag`), lower(`name` || '#' || `tag`), `ended_at`
FROM `player_names`
WHERE `ended_at` IS NOT NULL;
--> statement-breakpoint
INSERT INTO `player_search_fts` (`player_search_fts`) VALUES ('optimize');
