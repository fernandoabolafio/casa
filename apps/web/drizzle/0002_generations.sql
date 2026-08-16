-- Async generation jobs. Result bytes stay in R2; this row is the Home list.

CREATE TABLE `generation` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`base_image_id` text NOT NULL,
	`inspiration_ids` text NOT NULL,
	`prompt` text NOT NULL,
	`provider` text NOT NULL,
	`structure_lock` integer DEFAULT 1 NOT NULL,
	`result_image_id` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`base_image_id`) REFERENCES `image`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`result_image_id`) REFERENCES `image`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `generation_user_id_idx` ON `generation` (`user_id`);
--> statement-breakpoint
CREATE INDEX `generation_user_created_idx` ON `generation` (`user_id`,`created_at`);
