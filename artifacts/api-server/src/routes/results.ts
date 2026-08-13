import { Router, type IRouter } from "express";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db, gameResultsTable } from "@workspace/db";
import {
  GetResultsSummaryResponse,
  ListResultsResponse,
  SubmitResultBody,
  SubmitResultResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/results", async (req, res): Promise<void> => {
  req.log.info("Fetching leaderboard results");
  const rows = await db
    .select()
    .from(gameResultsTable)
    .orderBy(desc(gameResultsTable.score), asc(gameResultsTable.totalTime));

  res.json(ListResultsResponse.parse(rows));
});

router.post("/results", async (req, res): Promise<void> => {
  const parsed = SubmitResultBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid game result");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const [result] = await db
    .insert(gameResultsTable)
    .values({
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      score: data.score,
      rank: data.rank,
      timeC1: data.timeC1,
      timeC2: data.timeC2,
      timeC3: data.timeC3,
      timeC4: data.timeC4,
      totalTime: data.totalTime,
      isTest: data.isTest,
    })
    .onConflictDoUpdate({
      target: [gameResultsTable.firstName, gameResultsTable.lastName],
      set: {
        score: data.score,
        rank: data.rank,
        timeC1: data.timeC1,
        timeC2: data.timeC2,
        timeC3: data.timeC3,
        timeC4: data.timeC4,
        totalTime: data.totalTime,
        isTest: data.isTest,
      },
    })
    .returning();

  res.json(SubmitResultResponse.parse(result));
});

router.get("/results/summary", async (req, res): Promise<void> => {
  req.log.info("Fetching leaderboard summary");
  const rows = await db
    .select()
    .from(gameResultsTable)
    .where(and(eq(gameResultsTable.isTest, false)));

  const scores = rows.map((row) => row.score);
  const times = rows
    .map((row) => row.totalTime)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const latest = await db
    .select({ updatedAt: gameResultsTable.createdAt })
    .from(gameResultsTable)
    .orderBy(desc(gameResultsTable.createdAt))
    .limit(1);

  const summary = {
    participantCount: rows.length,
    averageScore: scores.length
      ? scores.reduce((total, value) => total + value, 0) / scores.length
      : 0,
    topScore: scores.length ? Math.max(...scores) : null,
    averageTime: times.length
      ? times.reduce((total, value) => total + value, 0) / times.length
      : null,
    fastestTime: times.length ? Math.min(...times) : null,
    updatedAt: latest[0]?.updatedAt ?? new Date(),
  };

  res.json(GetResultsSummaryResponse.parse(summary));
});

export default router;