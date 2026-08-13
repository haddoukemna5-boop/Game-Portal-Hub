import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, playerProgressTable } from "@workspace/db";

const router: IRouter = Router();

function validateBody(body: unknown): { name: string; score: number; won: number[]; times: Record<string, { start: number; seconds: number | null }>; submitted: boolean } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name.trim()) return null;
  if (typeof b.score !== "number" || b.score < 0 || b.score > 100) return null;
  if (!Array.isArray(b.won) || !b.won.every((x) => typeof x === "number")) return null;
  if (!b.times || typeof b.times !== "object") return null;
  if (typeof b.submitted !== "boolean") return null;
  return {
    name: (b.name as string).trim(),
    score: b.score as number,
    won: b.won as number[],
    times: b.times as Record<string, { start: number; seconds: number | null }>,
    submitted: b.submitted as boolean,
  };
}

router.get("/progress/:name", async (req, res): Promise<void> => {
  const name = decodeURIComponent(req.params.name).trim().toLowerCase();
  const [row] = await db
    .select()
    .from(playerProgressTable)
    .where(eq(playerProgressTable.name, name))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  res.json({
    name: row.name,
    score: row.score,
    won: row.won,
    times: row.times,
    submitted: row.submitted,
    updatedAt: row.updatedAt,
  });
});

router.put("/progress/:name", async (req, res): Promise<void> => {
  const name = decodeURIComponent(req.params.name).trim().toLowerCase();
  const data = validateBody(req.body);

  if (!data) {
    res.status(400).json({ error: "Invalid progress payload" });
    return;
  }

  const [row] = await db
    .insert(playerProgressTable)
    .values({
      name,
      score: data.score,
      won: data.won,
      times: data.times,
      submitted: data.submitted,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [playerProgressTable.name],
      set: {
        score: data.score,
        won: data.won,
        times: data.times,
        submitted: data.submitted,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json({
    name: row.name,
    score: row.score,
    won: row.won,
    times: row.times,
    submitted: row.submitted,
    updatedAt: row.updatedAt,
  });
});

export default router;
