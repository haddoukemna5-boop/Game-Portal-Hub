# Threat Model

## Project Overview

**Cyber Treasure Hunt** is a security-awareness game for corporate teams. Players create accounts by name and password, complete four weekly cybersecurity-themed quiz challenges, and earn points displayed on a shared leaderboard. An organizer admin console shows all results. The backend is an Express 5 + PostgreSQL API (port 5000); the frontend is a Vite/React SPA deployed at `https://game-portal-hub.replit.app` (Replit autoscale, private visibility).

Stack: pnpm workspaces, Node.js 24, TypeScript 5.9, Express 5, Drizzle ORM, Zod validation.

## Assets

- **Player credentials** — name + SHA-256 hash of password, stored in `playerProgressTable`. Compromise allows score manipulation or impersonation.
- **Player progress** — score (0–100), completed challenge indices, per-challenge timing. Integrity is needed for fair competition.
- **Leaderboard / game results** — `gameResultsTable` holds submitted final scores and completion times visible to all. Tampering undermines competition integrity.
- **Admin access** — organizer console shows all participant names, scores, and timing data. Unauthorized access exposes personal information.

## Trust Boundaries

- **Browser ↔ API** — All game logic runs in the browser; the API must validate and authorize every mutation. Currently neither endpoint enforces who owns a record.
- **Player ↔ Organizer** — The admin console is intended only for event organizers. Currently protected only by a client-side hardcoded passcode.
- **Public ↔ Authenticated** — All API endpoints are fully unauthenticated. The deployment is "private" on Replit, which limits exposure to the public internet but not to any player who has the link.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/routes/` — `health.ts`, `progress.ts` (login + PUT progress), `results.ts` (GET/POST results + GET summary)
- **Highest-risk code:** `progress.ts` `PUT /progress/:name` (no auth upsert), `results.ts` `POST /results` (no auth insert), `App.tsx` admin passcode comparison
- **Public surface:** All `/api/*` endpoints — no authentication middleware anywhere
- **Client-only security controls:** challenge date gates (`isUnlocked`), admin passcode check (`pass === 'changeme123'`), score calculation
- **Dev-only:** `artifacts/mockup-sandbox/` — design canvas, not reachable in production

## Threat Categories

### Spoofing / Broken Authentication

The application has no server-side session management. After login, the client stores progress in `localStorage` and calls `PUT /progress/:name` without any token. The server cannot distinguish between the legitimate player and an impersonator. The admin console passcode (`changeme123`) is hardcoded in the client bundle, making it trivially discoverable.

Required guarantees:
- All write endpoints MUST require a session token issued at login time and verified server-side.
- The admin console MUST authenticate via a server-side check, not a client-side string comparison.

### Tampering

No server-side validation ties a score to actual quiz answers. The `PUT /progress/:name` endpoint accepts any score 0–100, any challenge-won list, and any timing values from the request body. Similarly, `POST /results` accepts arbitrary scores, ranks, and names. A player can send fabricated data directly.

Required guarantees:
- Scores MUST be computed server-side based on recorded quiz answers, or the `PUT /progress/:name` caller MUST be proven to own the record via a session token.
- `POST /results` MUST require the session token of the submitting player and derive score from stored progress, not from request body fields.

### Information Disclosure

The admin console exposes all participants' names, scores, and completion times. It is protected only by a client-side passcode that is visible in the JS bundle. Any player can read every other participant's data.

Required guarantees:
- Admin data endpoints MUST be protected by server-side authentication (e.g., a secret environment variable checked in a middleware).

### Elevation of Privilege

A player can call `PUT /progress/:name` with any `name` to overwrite a competitor's score to 0 or claim a perfect score without answering questions. Challenge date gates are enforced only client-side and bypassed via `?preview`.

Required guarantees:
- Write access to a player's progress MUST be gated by a session token issued to that specific player at login.
- Challenge availability MUST be verified server-side before accepting a challenge-won claim.

### Denial of Service

No rate limiting exists on `/login` or any other endpoint. Automated login attempts can enumerate all player names and brute-force SHA-256 hashed passwords (fast hash, static salt).

Required guarantees:
- The `/login` endpoint SHOULD be rate-limited per IP.
- Passwords SHOULD be hashed server-side with a slow hash function (bcrypt/argon2).
