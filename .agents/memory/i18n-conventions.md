---
name: i18n conventions (crm-panel)
description: How the crm-panel translation system works and the two traps when localizing pages.
---

# crm-panel i18n

System lives in `artifacts/crm-panel/src/lib/i18n.tsx`: a `translations` object `{ en, ru }`, consumed via `import { useLang } from "@/lib/i18n"; const { t } = useLang();`.

## Rule: en is the source of truth
`type Translations = typeof translations.en`. So every key added to `en` MUST be mirrored in `ru` (and vice-versa) or `pnpm --filter @workspace/crm-panel run typecheck` fails. Add keys to both blocks in the same edit.

## Trap: `t` shadowing in `.map` callbacks
Many wizard/list components iterate with `.map((t) => ...)`, which shadows the i18n `t`. Before adding `const { t } = useLang()` to such a component, rename the loop var (e.g. `tr`, `rt`) or the i18n calls inside the callback silently reference the loop item.

## Trap: hardcoded labels in module-level const arrays
Constants like `STEPS`/`RELEASE_TYPES` in `components/release-wizard/types.ts` carry hardcoded Russian `label` fields. Components that render `s.label` bypass i18n entirely — localize by indexing a translation map by the const's `key`/`value` (e.g. `t.releaseWizard.steps[s.key]`) instead.

## Conventions
- Dynamic counts: `t.ns.key.replace("{count}", String(n))` with identical placeholder names in en/ru.
- Do NOT translate: DSP names (Spotify etc.), ISRC/UPC/DDEX/ERN acronyms, "Various Artists", "OK".
- The app has many pages still partly hardcoded; this is an app-wide, page-by-page effort.
