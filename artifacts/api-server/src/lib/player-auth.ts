import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";

export const PLAYER_COOKIE_NAME = "cth_player";
export const PLAYER_SESSION_TTL_SECONDS = 8 * 60 * 60;

function sessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function makeSession(playerName: string): string | null {
  const secret = sessionSecret();
  if (!secret) return null;

  const expiresAt = Math.floor(Date.now() / 1000) + PLAYER_SESSION_TTL_SECONDS;
  const encodedName = Buffer.from(playerName, "utf8").toString("base64url");
  const value = `player.${encodedName}.${expiresAt}`;
  return `${value}.${sign(value, secret)}`;
}

function cookieValue(req: Request): string | undefined {
  return req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PLAYER_COOKIE_NAME}=`))
    ?.slice(PLAYER_COOKIE_NAME.length + 1);
}

export function authenticatedPlayerName(req: Request): string | null {
  const secret = sessionSecret();
  const token = cookieValue(req);
  if (!secret || !token) return null;

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "player") return null;

  const expiresAt = Number(parts[2]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return null;

  const expected = sign(`${parts[0]}.${parts[1]}.${parts[2]}`, secret);
  const actual = parts[3];
  if (actual.length !== expected.length) return null;

  const valid = timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  if (!valid) return null;

  try {
    const playerName = Buffer.from(parts[1], "base64url").toString("utf8").trim().toLowerCase();
    return playerName || null;
  } catch {
    return null;
  }
}

export function setPlayerSession(res: Response, playerName: string): boolean {
  const token = makeSession(playerName);
  if (!token) return false;

  res.setHeader(
    "Set-Cookie",
    `${PLAYER_COOKIE_NAME}=${token}; HttpOnly; Path=/api; SameSite=Lax; Max-Age=${PLAYER_SESSION_TTL_SECONDS}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
  return true;
}

export const requirePlayer: RequestHandler = (req, res, next) => {
  if (!authenticatedPlayerName(req)) {
    res.status(401).json({ error: "Player authentication required." });
    return;
  }
  next();
};