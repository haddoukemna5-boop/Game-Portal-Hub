---
name: API auth pattern
description: How write endpoints authenticate callers — passwordHash verified server-side on every mutating request.
---

## Rule
`PUT /progress/:name` and `POST /results` require `passwordHash` in the request body. The server fetches the stored hash from `playerProgressTable` and returns 403 on mismatch before touching any data.

`POST /results` also requires `playerName` (the canonical lowercased name) to identify the player record — firstName/lastName alone are insufficient because they're derived display values.

**Why:** There is no session or JWT system. The passwordHash (SHA-256 of the user's password) serves as the per-request credential. This matches the existing login flow and avoids introducing new infrastructure.

**How to apply:** Any new mutating endpoint that touches player data must include the same passwordHash lookup + comparison before performing the write.
