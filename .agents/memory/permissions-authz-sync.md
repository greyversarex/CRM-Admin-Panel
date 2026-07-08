---
name: Frontend ROUTE_ROLES ↔ backend guard sync
description: crm-panel access is enforced by ROUTE_ROLES in two places; keep it in sync with the API's own role guards or you get visible-but-403 UI.
---

# Frontend ROUTE_ROLES must mirror backend role guards

`artifacts/crm-panel/src/lib/permissions.ts` `ROUTE_ROLES` + `canAccess()` (longest-prefix match) is the single source of truth for BOTH the sidebar nav (`sidebar-nav.tsx` filters items via `canAccess`) AND route access (`App.tsx` `ProtectedRoute` calls `canAccess`).

**Why:** editing `sidebar-nav.tsx`'s `*NavGroups` arrays alone does NOT restrict access — `canAccess` still governs the route and re-filters the nav anyway. Conversely, if `ROUTE_ROLES` grants a role a page whose backing API endpoints are guarded more tightly on the server (e.g. `adminOnly`), the user sees the nav item / page but every action 403s. That "visible but 403" mismatch is the recurring bug class here (`/delivery`, `/catalog/codes`, `/finance/unmatched`, publishing "В Broma16" button).

**How to apply:**
- To change who can reach a page, edit `ROUTE_ROLES` — one place fixes nav + route. Add an exact-path key to override a broader prefix (e.g. `/finance/unmatched` must be listed explicitly to override `/finance`).
- Before granting a role a page, confirm the page's API endpoints allow that role on the server; if an endpoint/action is admin/manager-only, gate the in-page button too (e.g. `useAuth()` role check), don't just rely on the route.
- Removing an item from a `*NavGroups` array is only cosmetic cleanup; `canAccess` is authoritative.
