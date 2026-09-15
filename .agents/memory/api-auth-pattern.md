---
name: API auth pattern
description: Durable authentication boundaries for player writes and organizer-only data.
---

## Rule
Player passwords are sent only during login and verified against salted, stretched server-side hashes. Successful login issues a signed HTTP-only player session; player reads and writes authorize against that session and its canonical player identity.

Organizer credentials remain server-side environment secrets. Successful organizer login issues a separate signed HTTP-only admin session, and participant result reads and organizer mutations require that session.

**Why:** A client-generated or database-stored hash becomes a replayable credential if accepted directly. Separate signed sessions prevent hash replay and keep admin secrets out of browser bundles.

**How to apply:** New player endpoints must use the authenticated session identity rather than client-supplied ownership fields. New organizer endpoints and sensitive participant-data reads must require the admin session.
