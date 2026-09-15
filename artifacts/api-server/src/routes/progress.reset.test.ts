/**
 * Integration tests for the password-reset flow.
 *
 * These tests run against the real database (DATABASE_URL must be set) and
 * verify the security-critical properties of the reset token path:
 *
 *  - A valid token can be redeemed exactly once.
 *  - Two concurrent redemption attempts with the same token result in exactly
 *    one success; the other gets 401 (the atomic conditional UPDATE ensures this).
 *  - Score, won, and times are unchanged after reset.
 *  - An expired token is rejected.
 *  - A wrong token is rejected.
 *  - The old password no longer works after an admin-initiated reset.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, playerProgressTable } from "@workspace/db";
import { hashPassword } from "../lib/password";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

process.env.SESSION_SECRET ??= "test-session-secret-123";
process.env.ADMIN_PASSWORD ??= "test-admin-password-123";

/** Create a fresh player directly in the DB, bypassing the login route. */
async function seedPlayer(opts: {
  name: string;
  password?: string;
  score?: number;
  won?: number[];
}) {
  const [row] = await db
    .insert(playerProgressTable)
    .values({
      name: opts.name.toLowerCase(),
      passwordHash: await hashPassword(opts.password ?? "old-password"),
      score: opts.score ?? 42,
      won: opts.won ?? [0, 1],
      times: { c1: { start: 1000, seconds: 120 }, c2: { start: 2000, seconds: 90 } },
      submitted: false,
      updatedAt: new Date(),
    })
    .returning();
  return row;
}

/** Trigger the admin reset via the API. Returns the reset token. */
async function authenticatedAdmin() {
  const agent = request.agent(app);
  await agent
    .post("/api/admin/login")
    .send({ username: process.env.ADMIN_USERNAME ?? "admin", password: process.env.ADMIN_PASSWORD })
    .expect(200);
  return agent;
}

async function adminReset(playerName: string): Promise<{ resetToken: string; expiresAt: string }> {
  const agent = await authenticatedAdmin();
  const res = await agent
    .delete(`/api/progress/${encodeURIComponent(playerName)}/password`)
    .send();

  expect(res.status, `admin reset failed: ${JSON.stringify(res.body)}`).toBe(200);
  expect(res.body.resetToken).toBeTruthy();
  return res.body as { resetToken: string; expiresAt: string };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let testPlayerName: string;

beforeEach(() => {
  // Use a unique name per test so tests don't interfere.
  testPlayerName = `test-reset-${randomUUID().slice(0, 8)}`;
});

afterEach(async () => {
  // Clean up the test player after every test.
  if (testPlayerName) {
    await db
      .delete(playerProgressTable)
      .where(eq(playerProgressTable.name, testPlayerName.toLowerCase()));
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/login/reset — password reset token redemption", () => {
  it("redeems a valid token, sets the new password, preserves score/won/times, and returns progress", async () => {
    await seedPlayer({ name: testPlayerName, score: 42, won: [0, 1] });
    const { resetToken } = await adminReset(testPlayerName);

    const res = await request(app)
      .post("/api/login/reset")
      .send({ name: testPlayerName, resetToken, password: "new-password" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe(testPlayerName.toLowerCase());
    expect(res.body.score).toBe(42);
    expect(res.body.won).toEqual([0, 1]);
    expect(res.body.times).toMatchObject({ c1: expect.any(Object) });

    // Old password must no longer work after reset
    const loginRes = await request(app)
      .post("/api/login")
      .send({ name: testPlayerName, password: "old-password" });
    expect(loginRes.status).toBe(401);

    // New password must work
    const newLoginRes = await request(app)
      .post("/api/login")
      .send({ name: testPlayerName, password: "new-password" });
    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body.score).toBe(42);
  });

  it("allows exactly one of two concurrent redemptions to succeed — the other gets 401", async () => {
    await seedPlayer({ name: testPlayerName });
    const { resetToken } = await adminReset(testPlayerName);

    // Fire both requests simultaneously.
    const [res1, res2] = await Promise.all([
      request(app)
        .post("/api/login/reset")
        .send({ name: testPlayerName, resetToken, password: "password-a" }),
      request(app)
        .post("/api/login/reset")
        .send({ name: testPlayerName, resetToken, password: "password-b" }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // Exactly one 200 and one 401.
    expect(statuses).toEqual([200, 401]);
  });

  it("rejects an expired token", async () => {
    await seedPlayer({ name: testPlayerName });

    // Directly insert an already-expired token.
    await db
      .update(playerProgressTable)
      .set({
        passwordHash: null,
        resetToken: "EXPIREDTOKEN1234",
        resetTokenExpiry: new Date(Date.now() - 1000), // 1 s in the past
      })
      .where(eq(playerProgressTable.name, testPlayerName.toLowerCase()));

    const res = await request(app)
      .post("/api/login/reset")
      .send({ name: testPlayerName, resetToken: "EXPIREDTOKEN1234", password: "new-password" });

    expect(res.status).toBe(401);
  });

  it("rejects a wrong token", async () => {
    await seedPlayer({ name: testPlayerName });
    await adminReset(testPlayerName); // Issues a real token (different value)

    const res = await request(app)
      .post("/api/login/reset")
      .send({ name: testPlayerName, resetToken: "WRONGWRONGWRONG1", password: "new-password" });

    expect(res.status).toBe(401);
  });

  it("returns 401 when the same valid token is redeemed a second time", async () => {
    await seedPlayer({ name: testPlayerName });
    const { resetToken } = await adminReset(testPlayerName);

    // First redemption succeeds.
    const first = await request(app)
      .post("/api/login/reset")
      .send({ name: testPlayerName, resetToken, password: "new-password" });
    expect(first.status).toBe(200);

    // Second redemption must fail — token is already consumed.
    const second = await request(app)
      .post("/api/login/reset")
      .send({ name: testPlayerName, resetToken, password: "another-password" });
    expect(second.status).toBe(401);
  });
});

describe("DELETE /api/progress/:name/password — admin reset initiation", () => {
  it("clears the existing password hash so the old password no longer works", async () => {
    await seedPlayer({ name: testPlayerName });
    await adminReset(testPlayerName);

    const loginRes = await request(app)
      .post("/api/login")
      .send({ name: testPlayerName, password: "old-password" });
    expect(loginRes.status).toBe(401);
  });

  it("rejects an anonymous reset attempt", async () => {
    await seedPlayer({ name: testPlayerName });

    const res = await request(app)
      .delete(`/api/progress/${encodeURIComponent(testPlayerName)}/password`)
      .send();

    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown player", async () => {
    const agent = await authenticatedAdmin();
    const res = await agent
      .delete("/api/progress/no-such-player-xyz/password")
      .send();

    expect(res.status).toBe(404);
  });

  it("does not expose a username-only password replacement endpoint", async () => {
    await seedPlayer({ name: testPlayerName });

    await request(app)
      .post("/api/reset-password")
      .send({ name: testPlayerName, password: "attacker-password" })
      .expect(404);

    await request(app)
      .post("/api/login")
      .send({ name: testPlayerName, password: "old-password" })
      .expect(200);
  });
});
