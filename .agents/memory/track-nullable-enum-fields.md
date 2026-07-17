---
name: Track nullable enum fields
description: explicit_status/ai_usage/audio_style must be NULL until the user chooses; three layers had defaults
---

Rule: tracks.explicit_status / ai_usage / audio_style stay NULL until the user explicitly picks a value; every layer that could fill them must be checked.

**Why:** "not chosen yet" must be distinguishable from a real choice — radios on the edit page were showing pre-selected values for fresh tracks. Defaults existed in THREE layers, and fixing only one looked done but wasn't:
1. OpenAPI `default:` on Create/UpdateTrackBody → generated Zod fills values server-side even when the client omits the keys.
2. DB columns had NOT NULL + DEFAULT — drizzle schema being plain `text()` does NOT alter an existing DB; a migration is required (0027 dropped them).
3. Multiple frontend creation paths (release-page bulk create, wizard, bulk audio upload) sent their own defaults.

**How to apply:** server routes strip Zod-applied defaults via `"field" in req.body` checks on both POST and PUT; verify with a real INSERT + `information_schema.columns` query, not just code reading. trackToForm maps null→"" and formToBody sends `|| undefined`.
