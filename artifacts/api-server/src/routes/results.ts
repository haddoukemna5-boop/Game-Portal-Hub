import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, gameResultsTable, playerProgressTable } from "@workspace/db";
import {
  GetResultsSummaryResponse,
  ListResultsResponse,
  SubmitResultBody,
  SubmitResultResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "./admin";

const router: IRouter = Router();

/** Capitalise the first character of a string. */
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Derive display-name parts from the canonical (lowercased) player name stored
 * in playerProgressTable.
 */
function deriveDisplayName(canonicalName: string): { firstName: string; lastName: string } {
  const parts = canonicalName.trim().split(/\s+/);
  const firstName = cap(parts[0] ?? canonicalName);
  const lastName = parts.length > 1 ? parts.slice(1).map(cap).join(" ") : "";
  return { firstName, lastName };
}

router.get("/results", requireAdmin, async (req, res): Promise<void> => {
  req.log.info("Fetching leaderboard results");
  res.setHeader("Cache-Control", "no-store");
  const rows = await db
    .select({ result: gameResultsTable, displayName: playerProgressTable.displayName })
    .from(gameResultsTable)
    .leftJoin(playerProgressTable, eq(gameResultsTable.playerName, playerProgressTable.name))
    .orderBy(desc(gameResultsTable.score), asc(gameResultsTable.totalTime));

  const results = rows.map(({ result, displayName }) => {
    if (!displayName) {
      // "Operator" was a legacy placeholder, not a real surname.
      return result.lastName.toLowerCase() === "operator" ? { ...result, lastName: "" } : result;
    }
    const parts = displayName.trim().split(/\s+/);
    return {
      ...result,
      firstName: cap(parts[0] ?? result.firstName),
      lastName: parts.length > 1 ? parts.slice(1).map(cap).join(" ") : "",
    };
  });

  res.json(ListResultsResponse.parse(results));
});

router.post("/results", async (req, res): Promise<void> => {
  const parsed = SubmitResultBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid game result");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const playerName = data.playerName.trim().toLowerCase();

  // Verify the caller is a registered player with a stored password
  const [player] = await db
    .select({ passwordHash: playerProgressTable.passwordHash, name: playerProgressTable.name, displayName: playerProgressTable.displayName })
    .from(playerProgressTable)
    .where(eq(playerProgressTable.name, playerName))
    .limit(1);

  if (!player) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  // Require a stored password — accounts without one cannot submit results
  if (!player.passwordHash) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  if (player.passwordHash !== data.passwordHash) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  // Derive display name from the authenticated player's canonical stored name.
  // The client-supplied firstName/lastName are ignored; playerName is the immutable
  // ownership key so no participant can overwrite another's leaderboard entry.
  const { firstName, lastName } = deriveDisplayName(player.displayName || player.name);

  const [result] = await db
    .insert(gameResultsTable)
    .values({
      playerName: player.name,
      firstName,
      lastName,
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
      target: [gameResultsTable.playerName],
      set: {
        firstName,
        lastName,
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

router.get("/results/summary", requireAdmin, async (req, res): Promise<void> => {
  req.log.info("Fetching leaderboard summary");
  res.setHeader("Cache-Control", "no-store");
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
