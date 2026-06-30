---
name: Broma16 push blocked until account onboarding complete
description: Artist/repertoire creation in ROD API returns 404 "not found" until the Broma16 account finishes onboarding; how to diagnose.
---

# Broma16 push step 1 (artist) fails with HTTP 404 "not found"

The release pusher's first step syncs artists via `POST /account/{accountId}/artist/` (and `GET .../artist/searche`). If the Broma16 account onboarding is **not complete**, every `/account/{id}/artist*` call returns `404 {"status":"error","errors":"not found"}` — even though login, `/user/`, dictionaries, and `/repertoire/release` all work.

**Root signal:** `GET /api/user/` returns `account_id` populated but `accounts: []` and `completion_step: "account"`. The empty `accounts[]` array means there is no provisioned repertoire account yet, so artist/catalog creation is rejected. A properly onboarded account returns a populated `accounts[]`.

**Why it's not a code/path bug:** all three source docs (BROMA16_API_MAP, REPLIT_PROMPT) specify `/account/{accountId}/artist/`. Probing confirmed: `/account/*` and `/accounts/*/artist*` (singular and plural) all 404, while account-scoped reads like `GET /accounts/{id}/assets/drafts/all` and `GET /accounts/societies` return 200. So the account id is valid for reads; creation is gated on onboarding.

**How to apply:** before debugging the pusher code, hit `/user/` (login with stored creds, `POST /api/auth/login`, then `GET /api/user/`). If `accounts: []` / `completion_step != "completed"`, the blocker is on Broma16's side — the user must finish account/legal setup in the Broma16 (ROD) panel. Do NOT mask the 404 by making `searchArtist` swallow it; that hides the real cause. The correct artist endpoint can only be confirmed against a fully onboarded account.

**CORRECTION (verified later):** The earlier 404 was caused by hitting the **wrong domain** — the account exists only on `lk.broma16.com` (account 554233), while `.ru` had `accounts: []` and would 404 on create. After switching the client default to `.com`, the artist step and `create_release` **succeed**, and the push reaches the distribution step. So an apparent `completion_step: "account"` did NOT actually block artist creation on the correct domain. First verify you are calling the domain where the account actually lives before assuming an onboarding blocker. See [push payload contract](broma16-push-payload-contract.md).
