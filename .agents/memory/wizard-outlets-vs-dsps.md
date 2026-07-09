---
name: Wizard outlets vs release_dsps
description: Two distinct distribution fields in the release model — which one the wizard, submission-validation, and Broma16 push actually use.
---

# Two separate distribution-target fields (do not conflate)

The release model has **two unrelated** distribution-target stores:

- **`release_dsps` table** (codes from local `dsp_catalog`, e.g. `apple_music`) — feeds the **direct DDEX delivery-worker** path. Codes without `ddexPartyId` must NOT be saved here or delivery fails. Endpoints: `GET/PUT /releases/:id/dsps`.
- **`releases.broma16DistributionOutlets`** (jsonb, Broma16 outlet codes) — the **actual delivery channel** in this product. Read by `release-pusher.ts` Step 8 via `resolveOutletCodes(...)`; falls back to `DEFAULT_OUTLETS` if empty. Endpoints: `GET/PUT /releases/:id/distribution-outlets` (wizard + availability page). The Broma16 push card now **POSTs with no body** so it reuses the **saved** outlets; `{ outlets }` in the push body is optional and, when omitted, the server does NOT overwrite the saved set (status=approved only).

**Decision (current):** ALL outlet selection in the UI drives `broma16DistributionOutlets` (Broma16 dictionary, ~39 outlets), NOT `release_dsps` — the release-creation wizard picker, the **release-availability page («Выбор площадок»)**, and the release-detail **availability summary («Stores» count)** all read/write `/distribution-outlets` via TanStack query key `["release-outlets", id]`. Submission dry-run *delivery* validation also checks `broma16DistributionOutlets`. The `release_dsps`/`dsp_catalog` UI path (`DspPickerInline`/`DspPickerDialog`, `useGetReleaseDsps`/`useUpdateReleaseDsps`, `GET/PUT /releases/:id/dsps`) is now **DEAD** — left compiled in the tree but wired to no page. **Trap:** it still has a nice categorized UI *and* a live endpoint, so it looks usable; do NOT resurrect it for outlet selection.

**Why:** Broma16 is the only real DSP-delivery channel here; the DDEX delivery-worker / `release_dsps` path is secondary. A wizard that wrote `release_dsps` never reached Broma16, so the picked outlets were ignored at push.

**How to apply:** when touching outlet/DSP selection, decide which channel you mean. Wizard + Broma16 push + submission-delivery-validation = `broma16DistributionOutlets`. Direct DDEX = `release_dsps`. Keep them in sync only if a feature genuinely needs both.

## Broma16 outlet dictionary shape gotcha
Broma16 `outlet` dict rows have **`code = null`** for ~all entries; only `externalId` + `name` are populated (e.g. `{externalId:"49803", code:null, name:"Apple Music, iTunes"}`). So `useCatalogOptions("outlet", {valueKey:"code"})` yields **externalId** as the stored value (code ?? externalId). Server validation of outlet codes must accept **code OR externalId**, and `resolveOutletCodes` resolves by code/name/externalId — all consistent. TCell's externalId is `-1`.
