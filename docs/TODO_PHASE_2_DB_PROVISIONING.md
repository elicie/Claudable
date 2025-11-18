# Phase 2 – Internal Postgres Provisioning TODO

This phase introduces **per-project Postgres databases** that are created **at deployment time**, not at project creation. The databases are internal and not exposed directly to end users.

> Goal: when a user deploys a project, automatically create (if needed) and wire a dedicated Postgres DB for that project.

---

## 1. Admin Postgres Connection

- [ ] Decide on an “admin” Postgres endpoint
  - [ ] Example: `DB_ADMIN_URL` pointing to internal Postgres with sufficient privileges
  - [ ] This can be separate from Claudable’s own metadata DB or the same cluster with a different role
- [ ] Implement a small internal DB client
  - [ ] Minimal wrapper using `pg` or similar
  - [ ] Utilities to run parameterized queries safely

---

## 2. Data Model for Application DBs

- [ ] Decide where to store per-project DB connection info
  - [ ] Option A: extend `ProjectServiceConnection` with provider `internal_db`
  - [ ] Option B: create a dedicated `ProjectDatabase` model
- [ ] Fields to store:
  - [ ] `projectId`
  - [ ] `databaseName` (e.g. `app_db_<projectId>`)
  - [ ] `username` (e.g. `app_u_<userId>` or per-project user)
  - [ ] `password` (encrypted or in a secret store)
  - [ ] `host`, `port`
  - [ ] `databaseUrl` (optional, can be derived)
  - [ ] timestamps

---

## 3. Provisioning Logic

- [ ] Create a service module, e.g. `lib/services/internal-postgres.ts`
  - [ ] `provisionProjectDatabase(projectId: string, ownerId: string): Promise<ProjectDatabaseInfo>`
  - [ ] Steps:
    - [ ] Check if database already exists for the project
      - [ ] If yes, return existing info
      - [ ] If no, proceed to create
    - [ ] Generate names:
      - [ ] `dbName = app_db_<projectId>`
      - [ ] `dbUser = app_u_<ownerId>` or per-project variant
      - [ ] `dbPassword = <random secure string>`
    - [ ] Execute SQL via admin connection:
      - [ ] `CREATE ROLE dbUser LOGIN PASSWORD 'dbPassword';`
      - [ ] `CREATE DATABASE dbName OWNER dbUser;`
    - [ ] Persist connection info in metadata DB
    - [ ] Return connection details (without exposing password to logs)
- [ ] Handle idempotency and errors
  - [ ] Safely handle “user/database already exists” cases
  - [ ] Rollback or clean up on partial failures

---

## 4. Deployment-Time Integration

- [ ] Identify deployment API endpoint
  - [ ] e.g. `POST /api/projects/[project_id]/deploy`
- [ ] Integrate provisioning into deployment flow
  - [ ] On deploy:
    - [ ] Ensure caller owns the project
    - [ ] Call `provisionProjectDatabase(projectId, ownerId)`
    - [ ] Get `DATABASE_URL` for the app
  - [ ] Inject `DATABASE_URL` into the app’s environment:
    - [ ] Option A: write to `.env.production` in `PROJECTS_DIR/<projectId>`
    - [ ] Option B: pass via process environment when starting the app

---

## 5. Local Schema Initialization (Optional)

- [ ] Decide if we provide a default schema for app DBs
  - [ ] Option A: apps manage their own migrations (recommended)
  - [ ] Option B: Claudable applies a minimal schema template
- [ ] If needed, implement a simple “schema bootstrap” step
  - [ ] Run migration or SQL script against the newly created DB

---

## 6. Security & Operations

- [ ] Ensure admin connection is only used on the server side
  - [ ] Never expose `DB_ADMIN_URL` to the client
- [ ] Consider basic resource limits
  - [ ] Naming conventions to easily identify project DBs and users
  - [ ] Periodic job to list and monitor these DBs
- [ ] Logging
  - [ ] Log provisioning events (projectId, dbName, ownerId)
  - [ ] Do not log passwords or full URLs

When this phase is complete, we have:

- Automatic internal Postgres DB creation at deploy time
- Stable `DATABASE_URL` per project
- Prepared ground for hosting the app with a real production DB
