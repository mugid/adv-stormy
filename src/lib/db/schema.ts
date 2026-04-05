import {
  pgTable,
  text,
  timestamp,
  boolean,
  customType,
  jsonb,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const boards = pgTable("boards", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  title: text("title").notNull().default("Untitled Board"),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Excalidraw document from `serializeAsJSON(..., "database")` (no embedded binaries) */
  sceneJson: text("scene_json"),
  /** ImageKit URLs keyed by Excalidraw fileId for canvas images */
  sceneFiles: jsonb("scene_files").$type<
    Record<string, { url: string; mimeType: string }> | null
  >(),
  yDocState: bytea("y_doc_state"),
  thumbnail: text("thumbnail"),
  /** Last generated / pinned video URL (Higgsfield or agent); shown in board overlay */
  pinnedVideoUrl: text("pinned_video_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const boardMembers = pgTable("board_members", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  boardId: text("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["editor", "viewer"] })
    .notNull()
    .default("editor"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Voice / agent observability and idempotency for board calls */
export const boardCallEvents = pgTable(
  "board_call_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("board_call_events_board_id_idx").on(t.boardId)]
);

/** Prevents duplicate processing of the same voice utterance (nonce per final STT phrase). */
export const boardVoiceTurnDedup = pgTable(
  "board_voice_turn_dedup",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    turnNonce: text("turn_nonce").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("board_voice_turn_dedup_board_nonce_uidx").on(
      t.boardId,
      t.turnNonce
    ),
  ]
);

/** At most one in-flight agent stream per board (voice + text when boardId is sent). */
export const boardAgentInflight = pgTable("board_agent_inflight", {
  boardId: text("board_id")
    .primaryKey()
    .references(() => boards.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").notNull().defaultNow(),
});

export const mediaGenerationJobs = pgTable("media_generation_jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  requestId: text("request_id").notNull().unique(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  boardId: text("board_id").references(() => boards.id, { onDelete: "set null" }),
  status: text("status").notNull().default("queued"),
  hfStatusUrl: text("hf_status_url"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  resultUrls: jsonb("result_urls").$type<{
    images?: string[];
    video?: string;
  } | null>(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
