import { pgTable, serial, text, integer, boolean, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export type ChallengeTime = { start: number; seconds: number | null };

export const playerProgressTable = pgTable(
  "player_progress",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    score: integer("score").notNull().default(0),
    won: jsonb("won").$type<number[]>().notNull().default([]),
    times: jsonb("times").$type<Record<string, ChallengeTime>>().notNull().default({}),
    submitted: boolean("submitted").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameUnique: uniqueIndex("player_progress_name_unique").on(table.name),
  }),
);

export type PlayerProgress = typeof playerProgressTable.$inferSelect;
