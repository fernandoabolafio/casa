-- Unguessable public share token. /results/:jobId stays private.
-- Unique index allows multiple NULLs so older rows mint lazily.

ALTER TABLE `generation` ADD `share_token` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_share_token_idx` ON `generation` (`share_token`);
