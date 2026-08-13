import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, playerProgressTable } from "@workspace/db";

const router: IRouter = Router();

type ProgressBody = {
  name: string;
  passwordHash: string;
  score: number;
  won: number[];
  times: Record<string, { start: number; seconds: number | null }>;
  submitted: boolean;
};

function validateProgressBody(body: unknown): ProgressBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name.trim()) return null;
  if (typeof b.passwordHash !== "string" || !b.passwordHash.trim()) return null;
  if (typeof b.score !== "number" || b.score < 0 || b.score > 100) return null;
  if (!Array.isArray(b.won) || !b.won.every((x) => typeof x === "number")) return null;
  if (!b.times || typeof b.times !== "object") return null;
  if (typeof b.submitted !== "boolean") return null;
  return {
    name: (b.name as string).trim(),
    passwordHash: (b.passwordHash as string).trim(),
    score: b.score as number,
    won: b.won as number[],
    times: b.times as Record<string, { start: number; seconds: number | null }>,
    submitted: b.submitted as boolean,
  };
}

// POST /login — create account or verify password, then return progress
router.post("/login", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  const passwordHash = typeof body.passwordHash === "string" ? body.passwordHash : "";

  if (!rawName || !passwordHash) {
    res.status(400).json({ error: "Name and password are required." });
    return;
  }

  const name = rawName.toLowerCase();

  const [existing] = await db
    .select()
    .from(playerProgressTable)
    .where(eq(playerProgressTable.name, name))
    .limit(1);

  if (!existing) {
    // New user — create account with the supplied password hash
    const [row] = await db
      .insert(playerProgressTable)
      .values({ name, passwordHash, score: 0, won: [], times: {}, submitted: false, updatedAt: new Date() })
      .returning();
    res.json({ isNew: true, name: row.name, score: row.score, won: row.won, times: row.times, submitted: row.submitted, updatedAt: row.updatedAt });
    return;
  }

  // Existing account must have a stored password; accounts without one are locked.
  // (No unauthenticated hash-adoption — that path is an account-takeover vector.)
  if (!existing.passwordHash) {
    res.status(401).json({ error: "Incorrect password." });
    return;
  }

  if (existing.passwordHash !== passwordHash) {
    res.status(401).json({ error: "Incorrect password." });
    return;
  }

  res.json({
    isNew: false,
    name: existing.name,
    score: existing.score,
    won: existing.won,
    times: existing.times,
    submitted: existing.submitted,
    updatedAt: existing.updatedAt,
  });
});

// PUT /progress/:name — save progress (requires passwordHash to authenticate the caller)
router.put("/progress/:name", async (req, res): Promise<void> => {
  const name = decodeURIComponent(req.params.name).trim().toLowerCase();
  const data = validateProgressBody(req.body);

  if (!data) {
    res.status(400).json({ error: "Invalid progress payload" });
    return;
  }

  // Fetch the stored record to verify the caller's identity
  const [existing] = await db
    .select({ passwordHash: playerProgressTable.passwordHash })
    .from(playerProgressTable)
    .where(eq(playerProgressTable.name, name))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Player not found." });
    return;
  }

  // Require a stored password — accounts without one cannot be written to via this endpoint
  if (!existing.passwordHash) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  if (existing.passwordHash !== data.passwordHash) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const [row] = await db
    .insert(playerProgressTable)
    .values({ name, score: data.score, won: data.won, times: data.times, submitted: data.submitted, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [playerProgressTable.name],
      set: { score: data.score, won: data.won, times: data.times, submitted: data.submitted, updatedAt: new Date() },
    })
    .returning();

  res.json({ name: row.name, score: row.score, won: row.won, times: row.times, submitted: row.submitted, updatedAt: row.updatedAt });
});

export default router;
