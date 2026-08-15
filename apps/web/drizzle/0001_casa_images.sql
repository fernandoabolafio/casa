-- Casa gallery metadata. Bytes live in R2 (`IMAGES` / casa-images).

CREATE TABLE `image` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`content_type` text NOT NULL,
	`kind` text NOT NULL,
	`filename` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `image_user_id_idx` ON `image` (`user_id`);
