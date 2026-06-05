---
name: Typecheck after regenerating shared libs
description: Why per-package typecheck shows stale-type errors after openapi/orval codegen, and the command that fixes it.
---

The monorepo uses TypeScript **project references**: `artifacts/*` packages consume the
*built* `.d.ts` of `lib/*` packages (e.g. `@workspace/api-client-react`, `@workspace/api-zod`),
not their source. Vite/runtime resolves the lib `src/` directly, but `tsc` reads the emitted
declaration output.

**Rule:** After changing `lib/api-spec/openapi.yaml` and running orval codegen (or any edit to a
referenced lib), run the **root** `pnpm run typecheck` — it runs `typecheck:libs` (`tsc --build`)
first to rebuild the lib `.d.ts`, then per-package typechecks. Running only
`pnpm --filter @workspace/crm-panel run typecheck` will report phantom errors (e.g. a freshly
added enum value "not assignable") because it reads stale declaration output.

**Why:** Adding `acrcloud_ddex` to the DeliveryTarget enum + codegen updated the generated source,
but `crm-panel` typecheck kept failing on the new value. The generated file was correct; the
referenced-project `.d.ts`/tsbuildinfo were stale. Deleting tsbuildinfo alone did not help —
`tsc --build` (root typecheck) was required.

**How to apply:** Whenever a task touches `lib/api-spec`, `lib/api-zod`, or `lib/api-client-react`
(or any composite lib), verify with root `pnpm run typecheck`, not the single-package filter.
