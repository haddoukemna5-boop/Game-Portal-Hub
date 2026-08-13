import { randomBytes } from "crypto";
import { Router, type IRouter } from "express";
import { and, eq, gt, isNotNull } from "drizzle-orm";
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

/**
 * Verify the admin passcode against SESSION_SECRET.
 * Returns an error string if invalid, null if valid.
 * Fails closed: if SESSION_SECRET is not configured, always rejects.
 */
function checkAdminPasscode(passcode: string): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return "Admin authentication is not configured on this server.";
  }
  if (!passcode || passcode !== secret) {
    return "Incorrect admin passcode.";
  }
  return null;
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

// POST /admin/auth — verify the admin passcode without exposing SESSION_SECRET to the client
router.post("/admin/auth", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const passcode = typeof body.passcode === "string" ? body.passcode : "";
  const authErr = checkAdminPasscode(adminPasscode);
  if (authErr) {
    const status = process.env.SESSION_SECRET ? 401 : 503;
    res.status(status).json({ error: authErr });
    return;
  }
  res.json({ ok: true });
});

// POST /login — create account or verify password, then return progress
router.post("/login", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  const passwordHash = typeof body.passwordHash === "string" ? body.passwordHash : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";

  if (!rawName || !passwordHash) {
    res.status(400).json({ error: "Username and password are required." });
    return;
  }

  const name = decodeURIComponent(req.params.name).trim().toLowerCase();

  const [existing] = await db
    .select({ name: playerProgressTable.name })
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
  });
});

// DELETE /progress/:name/password — admin-initiated password reset
// Generates a one-time reset token the player uses to reclaim their account.
// Score, won keys, and times are preserved. Requires the SESSION_SECRET as admin passcode.
router.delete("/progress/:name/password", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  const resetToken = randomBytes(8).toString("hex").toUpperCase();
  const passwordHash = typeof body.passwordHash === "string" ? body.passwordHash : "";

  if (!rawName || !resetToken || !passwordHash) {
    res.status(400).json({ error: "Name, reset token, and new password are required." });
    return;
  }

  const name = decodeURIComponent(req.params.name).trim().toLowerCase();

  // Use a generic error to avoid leaking whether the player name exists
  const invalidTokenError = "Invalid or expired reset token.";

  // Single atomic conditional UPDATE — validates and consumes the token in one
  // SQL statement. The WHERE clause matches name, exact token value, and a
  // non-expired non-null expiry so two concurrent requests with the same token
  // can never both succeed: the second finds no matching row (token already null).
  const now = new Date();
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
  });
});

// DELETE /progress/:name/password — admin-initiated password reset
// Generates a one-time reset token the player uses to reclaim their account.
// Score, won keys, and times are preserved. Requires the SESSION_SECRET as admin passcode.
router.delete("/progress/:name/password", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  const newPasswordHash = typeof body.newPasswordHash === "string" ? body.newPasswordHash.trim() : "";

  if (!rawName || !newPasswordHash) {
    res.status(400).json({ error: "Username and new password are required." });
    return;
  }

  const name = decodeURIComponent(req.params.name).trim().toLowerCase();

  const [existing] = await db
    .select({ name: playerProgressTable.name })
    .from(playerProgressTable)
    .where(eq(playerProgressTable.name, name))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "No account found with that username." });
    return;
  }

  await db
    .update(playerProgressTable)
    .set({ passwordHash: newPasswordHash })
    .where(eq(playerProgressTable.name, name));

  res.json({ ok: true });
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
    .select({ name: playerProgressTable.name })
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
  });
});

// DELETE /progress/:name/password — admin-initiated password reset
// Generates a one-time reset token the player uses to reclaim their account.
// Score, won keys, and times are preserved. Requires the SESSION_SECRET as admin passcode.
router.delete("/progress/:name/password", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const adminPasscode = typeof body.adminPasscode === "string" ? body.adminPasscode : "";

  const authErr = checkAdminPasscode(adminPasscode);
  if (authErr) {
    const status = process.env.SESSION_SECRET ? 401 : 503;
    res.status(status).json({ error: authErr });
    return;
  }

  const name = decodeURIComponent(req.params.name).trim().toLowerCase();

  const [existing] = await db
    .select({ name: playerProgressTable.name })
    .from(playerProgressTable)
    .where(eq(playerProgressTable.name, name))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Player not found." });
    return;
  }

  // Generate a cryptographically random one-time reset token (16 uppercase hex chars)
  const resetToken = randomBytes(8).toString("hex").toUpperCase();
  const resetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Clear the existing password hash so the old password cannot be used while the
  // reset token is pending. The player must redeem the token via POST /login/reset.
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
