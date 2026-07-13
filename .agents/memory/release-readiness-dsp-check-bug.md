---
name: Release readiness DSP check ignored Broma16 outlets
description: The "Отправить релиз на модерацию" issues check required release_dsps rows, but the only outlet-selection UI writes to release.broma16DistributionOutlets, so releases distributed only via Broma16 always failed with "Не выбрано ни одной DSP-площадки".
---

`GET /releases/:id/issues` (artifacts/api-server/src/routes/release-flow.ts) validated DSP selection by checking the `release_dsps` table only. Per `wizard-outlets-vs-dsps.md`, `release_dsps`/DspPicker is dead — the live wizard/availability UI writes selected outlets to `release.broma16DistributionOutlets` instead. Result: any release configured entirely through the Broma16 outlet picker was permanently blocked from submission by a false "no DSP selected" error, with no way to fix it from the UI.

**Fix applied:** the readiness check now also treats a non-empty `release.broma16DistributionOutlets` array as satisfying the DSP requirement (`dsps.length === 0 && (!broma16Outlets || broma16Outlets.length === 0)`).

**Why:** any future validation/readiness/completeness logic that checks "has the release picked DSPs" must consult `broma16DistributionOutlets`, not `release_dsps` — the latter is unused by all current UI paths.

**How to apply:** when adding new gates (delivery readiness, dashboards, reports, DDEX eligibility) that need to know "did the user select distribution targets", check `broma16DistributionOutlets` first; only fall back to `release_dsps` if Broma16 doesn't apply.

Separately: split-sum errors ("Сумма долей в split #N = 0%") are legitimate, not a bug — `splits` rows are per-track (one row per track, `trackId` set), `participants` is a jsonb array of `{..., share}`; `#N` is the split row's DB id, not a track index. A 0% total means the track's SplitShare participants exist with no assigned percentage — user must open that track's split editor and assign shares summing to 100%.
