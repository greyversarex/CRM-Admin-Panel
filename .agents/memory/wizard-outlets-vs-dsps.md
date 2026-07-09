---
name: Wizard outlets vs release_dsps
description: Two distinct distribution fields in the release model — which one the wizard, submission-validation, and Broma16 push actually use.
---

# Two separate distribution-target fields (do not conflate)

The release model has **two unrelated** distribution-target stores:

- **`release_dsps` table** (codes from local `dsp_catalog`, e.g. `apple_music`) — feeds the **direct DDEX delivery-worker** path. Codes without `ddexPartyId` must NOT be saved here or delivery fails. Endpoints: `GET/PUT /releases/:id/dsps`.
- **`releases.broma16DistributionOutlets`** (jsonb, Broma16 outlet codes) — the **actual delivery channel** in this product. Read by `release-pusher.ts` Step 8 via `resolveOutletCodes(...)`; falls back to `DEFAULT_OUTLETS` if empty. Endpoints: `GET/PUT /releases/:id/distribution-outlets` (wizard + availability page). The Broma16 push *send* is an **admin-only modal** on the release page: it seeds the outlet picker from `broma16DistributionOutlets` and POSTs `{ outlets }` (server persists the set, then enqueues; empty → base set). `{ outlets }` in the push body is optional; when omitted the server does NOT overwrite the saved set. Push requires status=approved.

**Decision (current):** ALL outlet selection in the UI drives `broma16DistributionOutlets` (Broma16 dictionary, ~39 outlets), NOT `release_dsps` — the release-creation wizard picker, the **release-availability page («Выбор площадок»)**, and the release-detail **availability summary («Stores» count)** all read/write `/distribution-outlets` via TanStack query key `["release-outlets", id]`. Submission dry-run *delivery* validation also checks `broma16DistributionOutlets`. The `release_dsps`/`dsp_catalog` UI path (`DspPickerInline`/`DspPickerDialog`, `useGetReleaseDsps`/`useUpdateReleaseDsps`, `GET/PUT /releases/:id/dsps`) is now **DEAD** — left compiled in the tree but wired to no page. **Trap:** it still has a nice categorized UI *and* a live endpoint, so it looks usable; do NOT resurrect it for outlet selection.

**Why:** Broma16 is the only real DSP-delivery channel here; the DDEX delivery-worker / `release_dsps` path is secondary. A wizard that wrote `release_dsps` never reached Broma16, so the picked outlets were ignored at push.

**How to apply:** when touching outlet/DSP selection, decide which channel you mean. Wizard + Broma16 push + submission-delivery-validation = `broma16DistributionOutlets`. Direct DDEX = `release_dsps`. Keep them in sync only if a feature genuinely needs both.

## Broma16 send is admin-only (managers see a read-only status indicator)
The Broma16 push **send** action is **admin-only**. On the **release detail page** it is a compact control in the actions row (NOT a standalone card): a small status chip (moderation/queue/error) shown to admin+manager, plus a **«Дистрибуция» button visible only to admins** that opens a modal. The modal holds ALL detail — Broma16 ID, moderation status, last-push time, errors, the outlet picker (seeded from `broma16DistributionOutlets`), «Отправить», and «Проверить статус». Managers get ONLY the read-only chip — no send button, no check button.

Backend guards: `POST /broma16/releases/:id/push` = `requireRole("admin")` (adminOnly). `GET .../push` (status) and `POST .../check-moderation` stay `...staff` (admin+manager) — so **UI exposure ≠ backend guard here**: the check-moderation route still accepts managers, the UI just no longer surfaces it to them (moderation also auto-syncs hourly).

**Why:** dispatching a release to real DSPs is high-stakes → admin-only; managers still need at-a-glance moderation visibility but not the actions. The big always-visible card felt like clutter on non-approved releases (empty fields), so it was collapsed to a button+chip.

**How to apply:** keep send/modal admin-only (`isAdmin`), chip for `isModeratorRole`. Don't "restore" a manager-facing check-status button assuming it's missing — that was intentionally moved into the admin modal. Don't tighten the check-moderation backend guard to admin-only just because the UI hides it from managers.

## Broma16 outlet dictionary shape gotcha
Broma16 `outlet` dict rows have **`code = null`** for ~all entries; only `externalId` + `name` are populated (e.g. `{externalId:"49803", code:null, name:"Apple Music, iTunes"}`). So `useCatalogOptions("outlet", {valueKey:"code"})` yields **externalId** as the stored value (code ?? externalId). Server validation of outlet codes must accept **code OR externalId**, and `resolveOutletCodes` resolves by code/name/externalId — all consistent. TCell's externalId is `-1`.
