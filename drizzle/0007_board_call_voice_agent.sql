CREATE TABLE IF NOT EXISTS "board_call_events" (
	"id" text PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb,
	"latency_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_call_events" ADD CONSTRAINT "board_call_events_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "board_call_events" ADD CONSTRAINT "board_call_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_call_events_board_id_idx" ON "board_call_events" ("board_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "board_voice_turn_dedup" (
	"id" text PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"turn_nonce" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_voice_turn_dedup" ADD CONSTRAINT "board_voice_turn_dedup_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "board_voice_turn_dedup" ADD CONSTRAINT "board_voice_turn_dedup_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "board_voice_turn_dedup_board_nonce_uidx" ON "board_voice_turn_dedup" ("board_id","turn_nonce");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "board_agent_inflight" (
	"board_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_agent_inflight" ADD CONSTRAINT "board_agent_inflight_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "board_agent_inflight" ADD CONSTRAINT "board_agent_inflight_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
