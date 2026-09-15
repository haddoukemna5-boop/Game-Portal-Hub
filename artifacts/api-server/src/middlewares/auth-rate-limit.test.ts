import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAuthRateLimitsForTests, createAuthRateLimit } from "./auth-rate-limit";

afterEach(() => {
  clearAuthRateLimitsForTests();
  vi.useRealTimers();
});

function testApp(maxAttempts = 2) {
  const app = express();
  app.use(express.json());
  app.post(
    "/login",
    createAuthRateLimit({
      namespace: "test",
      maxAttempts,
      windowMs: 60_000,
      identifier: (req) => typeof req.body?.username === "string" ? req.body.username : "",
    }),
    (req, res) => {
      if (req.body.password === "correct") res.json({ ok: true });
      else res.status(401).json({ error: "Incorrect password." });
    },
  );
  return app;
}

describe("authentication rate limiting", () => {
  it("blocks repeated failed attempts for the same account and address", async () => {
    const app = testApp();

    await request(app).post("/login").send({ username: "Admin", password: "wrong" }).expect(401);
    await request(app).post("/login").send({ username: "admin", password: "wrong" }).expect(401);
    const blocked = await request(app).post("/login").send({ username: "ADMIN", password: "correct" }).expect(429);

    expect(blocked.headers["retry-after"]).toBe("60");
  });

  it("keeps limits separate between account identifiers", async () => {
    const app = testApp(1);

    await request(app).post("/login").send({ username: "first", password: "wrong" }).expect(401);
    await request(app).post("/login").send({ username: "second", password: "correct" }).expect(200);
  });

  it("clears failed-attempt history after a successful login", async () => {
    const app = testApp();

    await request(app).post("/login").send({ username: "admin", password: "wrong" }).expect(401);
    await request(app).post("/login").send({ username: "admin", password: "correct" }).expect(200);
    await request(app).post("/login").send({ username: "admin", password: "wrong" }).expect(401);
    await request(app).post("/login").send({ username: "admin", password: "correct" }).expect(200);
  });
});