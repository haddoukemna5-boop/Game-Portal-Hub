import type { Request, RequestHandler } from "express";

type Attempt = {
  count: number;
  resetAt: number;
};

type AuthRateLimitOptions = {
  namespace: string;
  maxAttempts: number;
  windowMs: number;
  identifier?: (req: Request) => string;
};

const attempts = new Map<string, Attempt>();

function clientAddress(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function pruneExpired(now: number): void {
  if (attempts.size < 1_000) return;
  for (const [key, attempt] of attempts) {
    if (attempt.resetAt <= now) attempts.delete(key);
  }
}

export function createAuthRateLimit(options: AuthRateLimitOptions): RequestHandler {
  return (req, res, next): void => {
    const now = Date.now();
    pruneExpired(now);

    const identifier = options.identifier?.(req).trim().toLowerCase() || "unknown";
    const key = `${options.namespace}:${clientAddress(req)}:${identifier}`;
    const existing = attempts.get(key);
    const attempt = !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + options.windowMs }
      : existing;

    if (attempt.count >= options.maxAttempts) {
      const retryAfter = Math.max(1, Math.ceil((attempt.resetAt - now) / 1_000));
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: "Too many sign-in attempts. Please try again later." });
      return;
    }

    attempt.count += 1;
    attempts.set(key, attempt);

    res.once("finish", () => {
      if (res.statusCode < 400) attempts.delete(key);
    });
    next();
  };
}

export function clearAuthRateLimitsForTests(): void {
  attempts.clear();
}