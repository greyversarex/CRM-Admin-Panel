---
name: Integration auto-sync on connect
description: How integrations pull their startup data automatically when a connection is verified, not via manual sync.
---

# Integration auto-sync on connect

Integrations must pull their startup reference data (dictionaries, catalogs, initial stats) **automatically** the moment a connection is verified — never via a manual button or only on a weekly/daily cron. This is a standing product requirement from the label owner ("справочники и что бы то ни было должны сами подтягиваться системой").

**Mechanism:** `IConnector` has an optional `onConnected(ctx)` hook (in `connectors/base.ts`). `integrations-service.testConnection()` fires it **only on the transition into `connected`** (compare previous `integration.status` !== "connected"), in fire-and-forget mode (`void ... .catch(logger.error)`), so the test response is not blocked and a sync failure does not fail the connect.

**Broma16** implements `onConnected` → `syncAllDictionaries()` (genre/language/release_type/outlet/country). There is ALSO a boot sync (15s after server start, if configured) + weekly cron in `services/broma16/scheduler.ts`. The boot sync covers "server restarted while already configured"; the `onConnected` hook covers "just connected now". Statistics stay on the daily cron because they only exist once releases are actually distributed.

**Why:** before this, connecting an integration left dictionaries empty until next reboot or Sunday cron — user saw "connected" but no data, and the only way to populate was a manual POST. 

**How to apply:** any new integration that has reference data or initial pull should implement `onConnected` rather than relying solely on a scheduler or a manual endpoint.
