import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type RequestHandler } from "express";
import { createAuthRateLimit } from "../middlewares/auth-rate-limit";

const router: IRouter = Router();
const COOKIE_NAME = "cth_admin";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const adminLoginRateLimit = createAuthRateLimit({
  namespace: "admin-login",
  maxAttempts: 10,
  windowMs: 15 * 60 * 1_000,
  identifier: (req) => typeof req.body?.username === "string" ? req.body.username : "",
});

function adminUsername() {
  return (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
}

function adminPassword() {
  const password = process.env.ADMIN_PASSWORD?.trim();
  return password && password.length > 0 ? password : null;
}

function sessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

function signature(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const leftDigest = createHmac("sha256", "cth-admin-credential").update(left).digest();
  const rightDigest = createHmac("sha256", "cth-admin-credential").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function makeSession(): string | null {
  const secret = sessionSecret();
  if (!secret) return null;

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const value = `admin.${expiresAt}`;
  return `${value}.${signature(value, secret)}`;
}

function cookieValue(req: Parameters<RequestHandler>[0]) {
  const header = req.headers.cookie || "";
  const found = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  return found?.slice(COOKIE_NAME.length + 1);
}

function isValidSession(token: string | undefined) {
  const secret = sessionSecret();
  if (!secret) return false;
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "admin") return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const expected = signature(`${parts[0]}.${parts[1]}`, secret);
  const actual = parts[2];
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!isValidSession(cookieValue(req))) {
    res.status(401).json({ error: "Admin authentication required." });
    return;
  }
  next();
};

router.post("/admin/login", adminLoginRateLimit, (req, res): void => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!username || !password) {
    res.status(400).json({ error: "Admin username and password are required." });
    return;
  }

  const configuredPassword = adminPassword();
  const secret = sessionSecret();
  if (!configuredPassword || !secret) {
    res.status(503).json({ error: "Admin authentication is not configured." });
    return;
  }

  if (!safeEqual(username, adminUsername()) || !safeEqual(password, configuredPassword)) {
    res.status(401).json({ error: "Incorrect admin username or password." });
    return;
  }

  const session = makeSession();
  if (!session) {
    res.status(503).json({ error: "Admin authentication is not configured." });
    return;
  }

  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${session}; HttpOnly; Path=/api; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
  res.json({ authenticated: true });
});

router.get("/admin/session", requireAdmin, (_req, res): void => {
  res.json({ authenticated: true });
});

export default router;