---
name: DSP catalog category contract
description: The /dsp-catalog response category must stay within the OpenAPI enum, including the fallback default.
---

The `/dsp-catalog` endpoint maps each DSP to a `category` from a code→category
table with a `?? <default>` fallback. That default (and every table value) must
be one of the values in the OpenAPI `DspCatalogItem.category` enum.

**Why:** When the category scheme was reduced to two buckets
(`streaming_download`, `ugc_rights`), the table values were updated but the
fallback string was left as the old `"streaming"`. Any DSP code not in the table
would then emit an out-of-enum category, breaking zod/typed-client validation
and the frontend's Symphonic-style category/coverage grouping. Typecheck does
NOT catch this because the fallback is a bare string literal in a route handler.

**How to apply:** Whenever you change the DSP category enum (OpenAPI) or the
code→category map, update the `?? fallback` in the same edit and grep the route
for any stale literal. Keep the map's value type annotated to the union so the
table itself is type-checked, but remember the fallback literal still needs a
manual check.
