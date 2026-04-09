import {
  pgTable, uuid, text, integer, boolean, timestamp, numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── MOOVIED Comments ─────────────────────────────────────────────────────────
export const mooviedComments = pgTable("moovied_comments", {
  id:            uuid("id").primaryKey().defaultRandom(),
  movie_id:      text("movie_id").notNull(),
  user_id:       text("user_id").notNull(),
  user_name:     text("user_name").notNull(),
  content:       text("content").notNull(),
  created_at:    timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at:    timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  likes:         integer("likes").default(0).notNull(),
  edited:        boolean("edited").default(false).notNull(),
  reply_to:      uuid("reply_to"),
  reply_to_name: text("reply_to_name").default(""),
});

export const insertCommentSchema = createInsertSchema(mooviedComments).omit({
  id: true, created_at: true, updated_at: true, likes: true, edited: true,
});

export type Comment = typeof mooviedComments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

// ── MOOVIED Movie Meta ────────────────────────────────────────────────────────
// Stores extended fields that Google Sheets/GAS doesn't reliably return.
// This is the source of truth for synopsis, cast, gallery, ratings, downloads.
export const mooviedMovieMeta = pgTable("moovied_movie_meta", {
  movie_id:       text("movie_id").primaryKey(),
  synopsis:       text("synopsis").default(""),
  yt_link:        text("yt_link").default(""),
  tmdb_rating:    numeric("tmdb_rating", { precision: 4, scale: 1 }),
  rt_rating:      numeric("rt_rating",   { precision: 5, scale: 1 }),
  director:       text("director").default(""),
  director_image: text("director_image").default(""),
  cast:           text("cast").default(""),
  gallery:        text("gallery").default(""),
  dl_2160p:       text("dl_2160p").default(""),
  dl_1080p:       text("dl_1080p").default(""),
  dl_720p:        text("dl_720p").default(""),
  dl_480p:        text("dl_480p").default(""),
  dl_360p:        text("dl_360p").default(""),
  subtitle_url:   text("subtitle_url").default(""),
  updated_at:     timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MovieMeta = typeof mooviedMovieMeta.$inferSelect;
