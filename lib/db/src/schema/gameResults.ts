import { createInsertSchema } from "drizzle-zod";
import { pgTable, serial, text, real, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const gameResultsTable = pgTable(
  "game_results",
  {
    id: serial("id").primaryKey(),
    /** Canonical player name from playerProgressTable — immutable ownership key. */
    playerName: text("player_name").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    score: real("score").notNull(),
    rank: text("rank").notNull(),
    timeC1: real("time_c1"),
    timeC2: real("time_c2"),
    timeC3: real("time_c3"),
    timeC4: real("time_c4"),
    totalTime: real("total_time"),
    isTest: boolean("is_test").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    playerNameUnique: uniqueIndex("game_results_player_name_unique").on(table.playerName),
  }),
);

export const insertGameResultSchema = createInsertSchema(gameResultsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertGameResult = z.infer<typeof insertGameResultSchema>;
export type GameResult = typeof gameResultsTable.$inferSelect;
