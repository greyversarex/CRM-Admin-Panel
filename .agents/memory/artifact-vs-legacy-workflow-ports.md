---
name: Artifact-managed workflow vs legacy custom workflow on same port
description: When a repo's .replit already declares [[artifacts]] for a service, a legacy custom workflow bound to the same port can fail the platform's port-detection even though the server logs "listening" and answers curl.
---

Observed on the Tajik Music Distribution CRM monorepo (artifacts/api-server, port 8080) after a fresh GitHub re-import: the pre-existing custom "API Server" workflow (`pnpm --filter @workspace/db run migrate && PORT=8080 pnpm --filter @workspace/api-server run dev`, `waitForPort = 8080`) repeatedly reported `didn't open port 8080` / DIDNT_OPEN_A_PORT on WorkflowsRestart, even though its own logs showed `Server listening port: 8080` within ~1-2s and a manual shell run of the same command answered `curl localhost:8080` immediately (binds `0.0.0.0`, confirmed in code).

Once the platform auto-registered `artifacts/api-server` (because `.replit` already had a `[[artifacts]]` stanza for it) and generated the companion workflow `artifacts/api-server: API Server`, restarting *that* exact workflow name started cleanly on the first try and served the same code/port correctly.

**Why:** once a service is declared as an artifact in `.replit`, the platform seems to route/own port-forwarding for that service through the artifact-managed workflow. The old hand-written workflow pointed at the same port keeps failing the platform's readiness check even though the underlying process is healthy — this matches the "server healthy but the port still won't open" case in the debug-workflow-ports-issues skill, not a code bug.

**How to apply:** if a project has both a legacy custom workflow and an auto-generated `artifacts/<name>: ...` workflow targeting the same port, and the legacy one fails port-detection on restart despite healthy logs/curl, restart the artifact-managed workflow by its exact name instead of retrying the legacy one. Don't burn restart cycles on the legacy workflow once you've confirmed the server itself is fine.
