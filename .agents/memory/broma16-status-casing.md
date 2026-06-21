---
name: Broma16 response status casing
description: Broma16 (ROD) API returns status "OK"/"ok" inconsistently per endpoint; client must compare case-insensitively
---

The Broma16 (ROD) API success envelope is `{ status: ..., data: ... }`, but the
`status` value casing is NOT consistent across endpoints: some return lowercase
`"ok"` (e.g. genres, languages, country-code), others return uppercase `"OK"`
(e.g. `/dictionaries/release-types`, `/dictionaries/outlets`).

**Rule:** the client's success check must be case-insensitive
(`String(payload.status).toLowerCase() !== "ok"`). A strict `!== "ok"` silently
treats valid "OK" responses as errors ("Broma16 вернул статус != ok"), so those
dictionaries never sync even though the endpoint and params are correct.

**Why:** a strict comparison made release_type + outlet dictionary sync fail
while genre/language/country succeeded — the only difference was status casing.

**How to apply:** when adding new Broma16 endpoint calls or debugging a
"status != ok" error, first probe the raw response — the endpoint may be fine and
just returning "OK". Endpoint quirks confirmed working: release-types REQUIRES
both `category=audio` AND `language=ru` query params (422 without them).
