import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Four Better Auth tables copied from joga-app
// `backend/src/db/schema.ts` / `backend/drizzle/0000_wild_warhawk.sql`.

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const imageKind = ["upload", "generation"] as const;
export type ImageKind = (typeof imageKind)[number];

export const image = sqliteTable(
  "image",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    contentType: text("content_type").notNull(),
    kind: text("kind", { enum: imageKind }).notNull(),
    filename: text("filename").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("image_user_id_idx").on(table.userId)],
);

export const generationStatus = ["running", "done", "failed"] as const;
export type GenerationStatus = (typeof generationStatus)[number];

export const generation = sqliteTable(
  "generation",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: generationStatus }).notNull(),
    baseImageId: text("base_image_id")
      .notNull()
      .references(() => image.id),
    inspirationIds: text("inspiration_ids").notNull(),
    prompt: text("prompt").notNull(),
    provider: text("provider").notNull(),
    structureLock: integer("structure_lock", { mode: "boolean" })
      .notNull()
      .default(true),
    resultImageId: text("result_image_id").references(() => image.id),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("generation_user_id_idx").on(table.userId),
    index("generation_user_created_idx").on(table.userId, table.createdAt),
  ],
);
