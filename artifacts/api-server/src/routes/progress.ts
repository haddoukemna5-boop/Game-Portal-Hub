import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq, gt, isNotNull } from "drizzle-orm";
import { db, playerProgressTable } from "@workspace/db";
import { hashPassword, verifyPassword } from "../lib/password";
import { authenticatedPlayerName, requirePlayer, setPlayerSession } from "../lib/player-auth";

const router: IRouter = Router();

type ProgressBody = {
  name: string;
  score: number;
  won: number[];
  times: Record<string, { start: number; seconds: number | null }>;
  submitted: boolean;
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function validateProgressBody(body: unknown): ProgressBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name.trim()) return null;
  if (typeof b.score !== "number" || b.score < 0 || b.score > 100) return null;
  if (!Array.isArray(b.won) || !b.won.every((x) => typeof x === "number")) return null;
  if (!b.times || typeof b.times !== "object") return null;
  if (typeof b.submitted !== "boolean") return null;
  return {
    name: b.name.trim(),
    score: b.score,
    won: b.won as number[],
    times: b.times as Record<string, { start: number; seconds: number | null }>,
    submitted: b.submitted,
  };
}

function rowToLoginResult(row: typeof playerProgressTable.$inferSelect, isNew: boolean) {
  return {
    isNew,
    name: row.name,
    displayName: row.displayName ?? row.name,
    score: row.score,
    won: row.won,
    times: row.times,
    submitted: row.submitted,
    updatedAt: row.updatedAt,
  };
}

function requireSessionSecret(passcode: string): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return "Admin authentication is not configured on this server.";
  if (!passcode || passcode !== secret) return "Incorrect admin passcode.";
  return null;
}

function getBodyString(body: unknown, key: string): string {
  return body && typeof body === "object" && typeof (body as Record<string, unknown>)[key] === "string"
    ? ((body as Record<string, unknown>)[key] as string).trim()
    : "";
}

async function authenticatePasswordRequest(
  req: Parameters<typeof requirePlayer>[0],
  res: Parameters<typeof requirePlayer>[1],
): Promise<string | null> {
  const playerName = authenticatedPlayerName(req);
  if (!playerName) {
    res.status(401).json({ error: "Player authentication required." });
    return null;
  }
  return playerName;
}

router.post("/login", async (req, res): Promise<void> => {
  const rawName = getBodyString(req.body, "name");
  const password = getBodyString(req.body, "password");
  const displayName = getBodyString(req.body, "displayName");

  if (!rawName || !password) {
    res.status(400).json({ error: "Username and password are required." });
    return;
  }

  const name = normalizeName(rawName);
  const [existing] = await db
    .select()
    .from(playerProgressTable)
    .where(eq(playerProgressTable.name, name))
    .limit(1);

  if (existing) {
    if (!existing.passwordHash || !(await verifyPassword(password, existing.passwordHash))) {
      res.status(401).json({ error: "Incorrect password." });
      return;
    }

    if (!setPlayerSession(res, name)) {
      res.status(503).json({ error: "Player authentication is not configured on this server." });
      return;
    }
    res.json(rowToLoginResult(existing, false));
    return;
  }

  if (!displayName) {
    res.status(400).json({ error: "Full name is required when creating a profile." });
    return;
  }

  const passwordHash = await hashPassword(password);
  try {
    const [created] = await db
      .insert(playerProgressTable)
      .values({
        name,
        displayName,
        passwordHash,
        score: 0,
        won: [],
        times: {},
        submitted: false,
      })
      .returning();

    if (!setPlayerSession(res, name)) {
      res.status(503).json({ error: "Player authentication is not configured on this server." });
      return;
    }
    res.json(rowToLoginResult(created, true));
  } catch {
    res.status(409).json({ error: "That username is already in use. Please sign in." });
  }
});

router.post("/login/reset", async (req, res): Promise<void> => {
  const name = normalizeName(getBodyString(req.body, "name"));
  const resetToken = getBodyString(req.body, "resetToken").toUpperCase();
  const password = getBodyString(req.body, "password");

  if (!name || !resetToken || !password) {
    res.status(400).json({ error: "Username, reset code, and new password are required." });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [row] = await db
    .update(playerProgressTable)
    .set({ passwordHash, resetToken: null, resetTokenExpiry: null, updatedAt: new Date() })
    .where(
      and(
        eq(playerProgressTable.name, name),
        eq(playerProgressTable.resetToken, resetToken),
        gt(playerProgressTable.resetTokenExpiry, new Date()),
        isNotNull(playerProgressTable.resetToken),
        isNotNull(playerProgressTable.resetTokenExpiry),
      ),
    )
    .returning();

  if (!row) {
    res.status(401).json({ error: "Invalid or expired reset token." });
    return;
  }

  if (!setPlayerSession(res, name)) {
    res.status(503).json({ error: "Player authentication is not configured on this server." });
    return;
  }
  res.json(rowToLoginResult(row, false));
});

router.post("/reset-password", async (req, res): Promise<void> => {
  const name = normalizeName(getBodyString(req.body, "name"));
  const password = getBodyString(req.body, "password");
  if (!name || !password) {
    res.status(400).json({ error: "Username and new password are required." });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [row] = await db
    .update(playerProgressTable)
    .set({ passwordHash, resetToken: null, resetTokenExpiry: null, updatedAt: new Date() })
    .where(eq(playerProgressTable.name, name))
    .returning();

  if (!row) {
    res.status(404).json({ error: "No account found with that username." });
    return;
  }
  res.json({ error: "Password reset successfully." });
});

router.get("/progress/:name", async (req, res): Promise<void> => {
  const name = normalizeName(decodeURIComponent(req.params.name));
  const authenticatedName = await authenticatePasswordRequest(req, res);
  if (!authenticatedName || authenticatedName !== name) return;

  const [row] = await db
    .select()
    .from(playerProgressTable)
    .where(eq(playerProgressTable.name, name))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Player not found." });
    return;
  }
  res.json(row);
});

router.put("/progress/:name", async (req, res): Promise<void> => {
  const name = normalizeName(decodeURIComponent(req.params.name));
  const authenticatedName = await authenticatePasswordRequest(req, res);
  if (!authenticatedName || authenticatedName !== name) return;

  const data = validateProgressBody(req.body);
  if (!data || normalizeName(data.name) !== name) {
    res.status(400).json({ error: "Invalid progress payload." });
    return;
  }

  const [row] = await db
    .update(playerProgressTable)
    .set({
      score: data.score,
      won: data.won,
      times: data.times,
      submitted: data.submitted,
      updatedAt: new Date(),
    })
    .where(eq(playerProgressTable.name, name))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Player not found." });
    return;
  }
  res.json(row);
});

router.delete("/progress/:name/password", async (req, res): Promise<void> => {
  const authErr = requireSessionSecret(getBodyString(req.body, "adminPasscode"));
  if (authErr) {
    res.status(process.env.SESSION_SECRET ? 401 : 503).json({ error: authErr });
    return;
  }

  const name = normalizeName(decodeURIComponent(req.params.name));
  const [existing] = await db
    .select()
    .from(playerProgressTable)
    .where(eq(playerProgressTable.name, name))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Player not found." });
    return;
  }

  const resetToken = randomBytes(8).toString("hex").toUpperCase();
  const resetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [row] = await db
    .update(playerProgressTable)
    .set({ passwordHash: null, resetToken, resetTokenExpiry, updatedAt: new Date() })
    .where(eq(playerProgressTable.name, name))
    .returning();

  res.json({
    name: row.name,
    score: row.score,
    won: row.won,
    times: row.times,
    submitted: row.submitted,
    updatedAt: row.updatedAt,
    resetToken,
    expiresAt: resetTokenExpiry.toISOString(),
  });
});

export default router;