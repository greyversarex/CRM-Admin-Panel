---
name: VPS production deploy
description: Production runs on user's Timeweb VPS, not Replit deployments — where system deps must be declared
---

Production is NOT a Replit deployment: the user hosts it on a Timeweb cloud VPS.
Two deploy paths exist in-repo: `deploy/1_setup.sh` + `deploy/2_deploy.sh` (pm2 + nginx, the one actually used) and a `Dockerfile`/`docker-compose.yml` (node:20-bookworm-slim).

**Why:** ffmpeg/ffprobe exist implicitly in the Replit dev environment but not on the VPS or in the slim Docker image — Audio QC failed in prod with `spawn ffprobe ENOENT` until ffmpeg was added to all three places (1_setup.sh, 2_deploy.sh guard, Dockerfile runtime stage).

**How to apply:** any new system-level binary the API shells out to must be added to `deploy/1_setup.sh`, a `command -v` guard in `deploy/2_deploy.sh`, and the Dockerfile runtime stage — Replit `installSystemDependencies` alone only fixes dev/Replit deploys. After changes, the user redeploys by pulling the repo on the VPS and running `deploy/2_deploy.sh`.
