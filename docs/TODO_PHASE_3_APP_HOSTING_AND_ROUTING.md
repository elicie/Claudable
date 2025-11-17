# Phase 3 – App Hosting & Routing TODO

This phase implements **self-hosted app hosting** similar to Vercel, using a wildcard domain and per-project subdomains.

> Goal: serve each deployed project at `proj-<projectId>.apps.your-domain.com`, backed by a Next.js app process with the correct `DATABASE_URL`.

---

## 1. Domain & Reverse Proxy Setup

- [ ] DNS
  - [ ] Create wildcard record for `*.apps.your-domain.com` pointing to the app host
- [ ] Reverse proxy (e.g. Nginx/Traefik)
  - [ ] Configure a server block / router that:
    - [ ] Accepts requests for `*.apps.your-domain.com`
    - [ ] Forwards to a local port based on subdomain mapping (see below)
- [ ] TLS
  - [ ] Obtain wildcard certificate for `*.apps.your-domain.com`
  - [ ] Configure HTTPS termination at the proxy

---

## 2. Project Subdomain Model

- [ ] Extend `Project` model or related metadata with:
  - [ ] `appSubdomain` field (e.g. `proj-<projectId>`)
  - [ ] `appHost`/`appPort` or similar runtime fields (or a separate table for deployments)
- [ ] Decide subdomain naming convention
  - [ ] Default: `proj-<projectId>`
  - [ ] Optional: allow user-friendly slugs later
- [ ] Ensure subdomain is unique per project

---

## 3. Build & Start Deployed App

- [ ] Decide app deployment mode for each project
  - [ ] Option A: per-project Next.js build + `next start`
  - [ ] Option B: multi-tenant Next.js app that mounts per-project code dynamically (more complex; start with A)
- [ ] Implement per-project build
  - [ ] Use `PROJECTS_DIR/<projectId>` as the app root
  - [ ] Run:
    - [ ] `npm install` (once) if needed
    - [ ] `next build`
  - [ ] Store build status / logs in metadata
- [ ] Implement per-project start
  - [ ] Allocate an available port for the project
  - [ ] Start `next start` (or equivalent) on that port
  - [ ] Pass `DATABASE_URL` and any needed env vars
  - [ ] Keep track of:
    - [ ] PID / process handle
    - [ ] Port
    - [ ] Status (`starting`, `running`, `stopped`, `error`)

> Note: we can reuse patterns from `lib/services/preview.ts` (PreviewManager) for port allocation, logging, and process management.

---

## 4. Routing Integration

- [ ] Introduce a routing map in metadata
  - [ ] e.g. `ProjectDeployment` table:
    - [ ] `projectId`
    - [ ] `subdomain`
    - [ ] `port`
    - [ ] `status`
    - [ ] timestamps
- [ ] Expose an internal HTTP endpoint for the reverse proxy
  - [ ] Optional optimization: if the proxy can’t read metadata directly
  - [ ] Endpoint returns target upstream for a given subdomain
- [ ] Connect proxy configuration to this mapping
  - [ ] For Nginx: use `map`/`include` files, or a small sidecar that writes config snippets and reloads
  - [ ] For Traefik: use dynamic configuration via labels or file provider

---

## 5. Deployment API Flow

- [ ] Implement or extend deployment API, e.g. `POST /api/projects/[project_id]/deploy`:
  - [ ] Verify ownership (Phase 1)
  - [ ] Ensure project has a provisioned DB (Phase 2)
  - [ ] Build the app (or reuse existing build if unchanged)
  - [ ] Start or restart the project app process on a port
  - [ ] Update `ProjectDeployment` / project fields with:
    - [ ] `subdomain`
    - [ ] `port`
    - [ ] `status`
  - [ ] Return deployment URL:
    - [ ] `https://proj-<projectId>.apps.your-domain.com`

---

## 6. Health Checks & Lifecycle

- [ ] Implement health checks:
  - [ ] Simple HTTP `GET /` or `/health` from Claudable to the project app
  - [ ] Mark deployment status accordingly
- [ ] Implement stop/restart operations:
  - [ ] API endpoints to stop or restart project apps
  - [ ] Clean up ports and PIDs
- [ ] Log aggregation:
  - [ ] Reuse preview logs pattern
  - [ ] Store recent logs in metadata for debugging

When this phase is complete, we have:

- Self-hosted app hosting for each project
- Per-project subdomains under `*.apps.your-domain.com`
- Connection to a dedicated Postgres DB per project

