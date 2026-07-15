---
name: Spotify connector test/token quirks
description: Why the Spotify integration "Проверить" fails (400/403) and how the connector test should behave
---

# Spotify integration connect/test quirks

**Obtaining a client_credentials token IS the proof that the keys are valid.** The
extra catalog "verify" call after the token is only a health check — do NOT hard-fail
the whole connection on its non-2xx. Spotify Web API can return **403** on catalog
endpoints (e.g. `/artists/{id}`) even with a valid token due to endpoint/quota
restrictions. So: token OK + verify OK → `ok:true`; token OK + verify non-2xx →
`ok:true, unverified:true` with an explanatory message; token FAILS → `ok:false`.
Use `/search` (the endpoint transfer actually uses) for the verify, not a hardcoded artist id.

**HTTP 400 from `accounts.spotify.com/api/token` = `invalid_client`** = wrong Client ID
or Secret. The #1 real cause is **copy-paste whitespace/newlines** in the pasted keys,
which corrupt the Basic auth header. **Always `.trim()` clientId/clientSecret before
building the Basic header** — do it in BOTH the connector (`getAccessToken`) and the
transfer token helper (`getSpotifyToken` in routes/releases.ts). Credentials are stored
encrypted as-entered, so trimming must happen at use-time, not just on save.

**Frontend error surfacing:** the integration test route returns `{ ok:false, message }`
with HTTP 400 on failure. The local `api()` helper in `integration-config-dialog.tsx`
threw away the reason because it read only `j?.error` — the connector puts the reason in
`j?.message`. Fallback must be `j?.error ?? j?.message ?? "HTTP <status>"` or the user
just sees a useless "HTTP 400".

**Why:** users kept getting an opaque "Сбой соединения HTTP 400" and couldn't tell that
Spotify was rejecting the keys (usually a stray space). Making token-success authoritative
plus surfacing the real reason unblocks self-service.
