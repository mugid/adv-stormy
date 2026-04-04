CREATE TABLE "media_generation_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL UNIQUE,
	"user_id" text NOT NULL,
	"board_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"hf_status_url" text,
	"payload" jsonb NOT NULL,
	"result_urls" jsonb,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_generation_jobs" ADD CONSTRAINT "media_generation_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "media_generation_jobs" ADD CONSTRAINT "media_generation_jobs_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE set null ON UPDATE no action;
