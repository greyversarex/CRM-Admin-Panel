---
name: Dev CORS vs Vite proxy Origin
description: Why same-origin POSTs failed CORS in dev (Replit preview) and the fix
---

# Dev CORS failing on POST in Replit preview

Symptom: demo login (and any POST) fails with "CORS: origin not allowed" while
GET requests work fine.

**Root cause:** frontend calls API via relative `/api/...` through the Vite dev
proxy with `changeOrigin: false`, so the browser's preview-domain `Origin` is
forwarded to the API. Browsers attach `Origin` to same-origin **POST/PUT/DELETE**
but NOT to same-origin GET — so GET passed the `if (!origin) allow` branch while
POST hit the whitelist and was rejected. The Replit preview / Canvas-iframe domain
varies and won't match a single `REPLIT_DEV_DOMAIN` fallback.

**Fix:** in the API CORS `origin` callback, allow ANY origin when
`NODE_ENV !== "production"`. Production stays strict via `WEB_ORIGINS`.

**Why:** dev preview domains are unpredictable; a static dev whitelist is fragile.
**How to apply:** never try to enumerate dev preview origins; gate the open policy
on `!isProduction`. Keep prod locked to `WEB_ORIGINS`.
