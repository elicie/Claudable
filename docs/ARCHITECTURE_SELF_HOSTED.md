# Claudable Self-Hosted Architecture & Multi-Tenant Design

This document summarizes our current design decisions for running Claudable as a **self‑hosted, multi‑tenant platform** that can:

- Integrate with **Claude Code** (via `@anthropic-ai/claude-agent-sdk` and the Claude CLI)
- Integrate with **Codex CLI**
- Provide **per‑user Postgres databases** (Supabase‑like DB experience, but internal)
- Provide **per‑project app hosting** (Vercel‑like hosting experience, but internal)

The focus here is on the **target architecture and responsibilities**, not on implementation details of every API.

---

## 1. High-Level Components

We conceptually split the system into three planes:

1. **Control Plane** – Claudable app itself
2. **Data Plane** – Internal Postgres cluster(s)
3. **App Execution Plane** – User applications (Next.js apps) exposed via wildcard domains

### 1.1 Control Plane (Claudable)

- Domain: `claudable.your-domain.com`
- Technology: this repository (Next.js 15 App Router, Node runtime, Prisma)
- Responsibilities:
  - User authentication & multi‑tenancy
  - Project lifecycle (create, edit, delete, deploy)
  - Integration with:
    - Claude Code (`@anthropic-ai/claude-agent-sdk` + `claude` CLI)
    - Codex CLI
    - Optional external services (GitHub) – designed for pure self‑host without Vercel/Supabase
  - Internal Postgres provisioning (per‑project DB)
  - App deployment & routing metadata:
    - Which project is deployed?
    - What is its subdomain?
    - Where is the app process running (port, host)?

### 1.2 Data Plane (Internal Postgres)

- One or more **Postgres clusters**.
- Not necessarily exposed publicly:
  - e.g. `db.internal:5432` reachable only from the internal network.
- Responsibilities:
  - Store **Claudable metadata** (User, Project, Messages, etc.) via Prisma.
  - Store **per‑project application data**:
    - For each project, we create:
      - A dedicated database: `app_db_<projectId>`
      - A dedicated role/user: `app_u_<userId>` or `app_u_<projectId>`
    - Claudable sets `DATABASE_URL` for the generated Next.js app to point to this DB.

### 1.3 App Execution Plane (Hosted Apps)

- Domain: `*.apps.your-domain.com` (wildcard DNS)
- Each deployed project is accessible via its own subdomain:
  - `proj-<projectId>.apps.your-domain.com`
  - Optionally, custom subdomains or custom domains later.
- Backed by one or more app servers (Node + reverse proxy):
  - Nginx/Traefik in front
  - Next.js apps running via `npm start`, PM2, or Docker

Responsibilities:

- Serve **user applications** (Next.js 15 apps generated/managed by Claudable).
- Connect to their **per‑project Postgres DB** via `DATABASE_URL`.

---

## 2. Current Code Structure (Simplified)

### 2.1 AI Execution

- API entry point: `app/api/chat/[project_id]/act/route.ts`
  - Parses request body (`instruction`, `images`, `cliPreference`, `selectedModel`).
  - Resolves project root path (under `PROJECTS_DIR`).
  - Creates a `Message` (role: `user`) for the project.
  - Chooses the executor based on `cliPreference`:
    - `claude` → `lib/services/cli/claude.ts`
    - `codex` → `lib/services/cli/codex.ts`
    - `cursor` → `lib/services/cli/cursor.ts`
    - `qwen` → `lib/services/cli/qwen.ts`
    - `glm` → `lib/services/cli/glm.ts`
  - For initial prompts: `initializeNextJsProject(...)`
  - For subsequent changes: `applyChanges(...)`

#### Claude Code Integration

- File: `lib/services/cli/claude.ts`
- Uses `@anthropic-ai/claude-agent-sdk`:
  - `query(...)` streams events from Claude Code runtime.
  - Parses:
    - Assistant messages
    - Tool usage (`tool_use`, `tool_result`)
  - Persists them as `Message` records with `cliSource: 'claude'`.
- Error handling:
  - Detects missing CLI (`claude` binary)
  - Detects auth issues (`claude auth login` required)
- CLI/SDK setup:
  - `claude_code_zai_env.sh` helps install the CLI and configure `~/.claude` for the Z.AI Anthropic endpoint.
  - `scripts/check-claude-cli.js` checks `claude --version` and prints instructions.

#### Codex CLI Integration

- File: `lib/services/cli/codex.ts`
- Uses `child_process.spawn` to execute:
  - `codex exec --json --dangerously-bypass-approvals-and-sandbox ...`
- Reads JSONL events from stdout:
  - `item.started`, `item.delta`, `item.completed`, `item.failed`, `error`, `turn.completed`
- Builds:
  - Assistant messages (including `<thinking>...</thinking>` segments)
  - Tool messages for:
    - `apply_patch` (file changes)
    - `exec_command` (shell)
    - web search
    - MCP tools
    - plan/todo list updates
- Persists messages with `cliSource: 'codex'`.

---

## 3. Multi-Tenant Model (Users & Projects)

The current schema (`prisma/schema.prisma`) has:

- `Project` – core unit for generated code and AI interactions.
- `Message`, `Session`, `UserRequest`, `ProjectServiceConnection`, etc.
- **No `User` model yet**, so everything is effectively single‑tenant.

### 3.1 Target Multi-Tenant Structure

We introduce:

- `User` model:
  - Fields: `id`, `email`, `name`, `passwordHash` (or external auth IDs), timestamps.
- `Project.ownerId`:
  - Foreign key to `User.id`.
  - Each project belongs to exactly one user.

Implications:

- All project queries and mutations must be **scoped by the current user**.
- A simple auth flow (initially):
  - `POST /api/auth/signup` → create `User`, store password hash.
  - `POST /api/auth/login` → verify, set `HttpOnly` cookie (session/JWT).
  - API routes read the cookie and attach `currentUser` to the request context.
  - Frontend uses a minimal `useCurrentUser` hook/context to control access.

This is enough to:

- Prevent cross‑tenant project access.
- Attach per‑user DBs and apps in a clean way.

---

## 4. Postgres Provisioning Strategy

We distinguish between:

- **Claudable metadata DB** – for Users, Projects, Messages, etc.
  - Typically a Postgres DB accessed by Prisma (replacing SQLite in production).
- **Per‑project application DBs** – where user apps store their own data.

### 4.1 When to Create Application DBs?

We use **deployment time**, not project creation time:

- Project creation:
  - Does **not** create a Postgres database.
  - User can experiment, generate code, and preview without any dedicated DB.
- First deployment:
  - If the project has no production DB yet:
    - Using an admin Postgres connection:
      - `CREATE ROLE app_u_<userId> LOGIN PASSWORD '<random>'`
      - `CREATE DATABASE app_db_<projectId> OWNER app_u_<userId>`
    - Store a `DATABASE_URL` for this project in Claudable metadata (e.g. via `ProjectServiceConnection`).
    - Inject that `DATABASE_URL` into the app's environment:
      - `.env.production` inside `PROJECTS_DIR/<projectId>` or
      - Runtime env variables for the deployed app.
- Subsequent deployments:
  - Reuse the existing `DATABASE_URL`.

Advantages:

- Only **projects that are actually deployed** get real DBs.
- Clear mental model:
  - "Deploy" = "allocate production DB and app resources".

### 4.2 DB UI & Connection Details

Initial design:

- No DB UI is required.
- Users do **not** need direct DB access:
  - Claudable scaffolds the app with a `DATABASE_URL` and the app just works.
- Internal metadata stores host/port/db/user/password.

Later (optional enhancement):

- If we decide to expose DB access:
  - Use a **single public DB host**, e.g. `db.your-domain.com`.
  - Show per‑project:
    - `database`: `app_db_<projectId>`
    - `user`: `app_u_<userId>` (or `<projectId>`)
    - `password`: managed/rotated by the platform.
  - Connection string example:
    - `postgres://app_u_123:***@db.your-domain.com:5432/app_db_987`

---

## 5. App Hosting Architecture

We want a Vercel‑like experience, but self‑hosted.

### 5.1 Domains

- DNS:
  - `*.apps.your-domain.com` → one or more app servers (reverse proxy).
- Each project:
  - Gets a unique subdomain, e.g. `proj-<projectId>.apps.your-domain.com`.
  - Stored in Claudable metadata (e.g. `Project.appSubdomain`).

### 5.2 Routing

At deployment time, Claudable knows:

- The project ID
- The app's runtime location:
  - e.g. `http://127.0.0.1:41xxx` for a particular project.

Reverse proxy (Nginx/Traefik) routes:

- `proj-123.apps.your-domain.com` → `http://127.0.0.1:41023`
- `proj-456.apps.your-domain.com` → `http://127.0.0.1:41024`

TLS:

- Single wildcard certificate for `*.apps.your-domain.com` is sufficient.

### 5.3 Relationship with PreviewManager

- `lib/services/preview.ts` already runs **per‑project dev servers**:
  - Chooses ports via `findAvailablePort`.
  - Starts `npm run dev` or similar in `PROJECTS_DIR/<projectId>`.
- For production:
  - We can:
    - Build the app (`next build`), then
    - Run `next start` (or an equivalent) per project, or
    - Use a shared multi‑tenant Next.js server with dynamic routing.
- The key is:
  - Preview uses ephemeral ports and local URLs.
  - Production uses stable subdomains via the reverse proxy.

---

## 6. Why We Don't Need Per-Project DB Domains

Unlike Supabase, we do **not** need per‑project DB domains like `https://xxxxx.supabase.co`.

- Internal design:
  - Postgres clusters are addressed by a small set of internal hostnames / IPs.
  - Per‑project isolation is done at the **database/user** level, not via domains.
- Users do not need to see DB hostnames at all:
  - Apps connect via `DATABASE_URL` configured by Claudable.
  - For most customers, "I have a working app with a DB" is enough.
- If direct DB access becomes a requirement later:
  - A single host (`db.your-domain.com`) + per‑project DB/role is the simplest safe model.

---

## 7. Summary of Agreed Design

1. **Self-Hosted**:
   - Claudable runs on internal servers (no Vercel required).
   - Internal Postgres replaces Supabase for both metadata and app DBs.

2. **AI Integration**:
   - Claude Code via `@anthropic-ai/claude-agent-sdk` and CLI.
   - Codex CLI via `codex exec --json`.

3. **Multi-Tenancy**:
   - Introduce `User` model.
   - `Project.ownerId` associates projects with users.
   - All project operations are scoped by the logged‑in user.

4. **Postgres Provisioning**:
   - Dedicated app DB per project.
   - DBs are created **at first deployment**, not at project creation.
   - DB connection details are stored internally and injected into app env.
   - No DB UI or domains shown initially.

5. **App Hosting**:
   - `*.apps.your-domain.com` wildcard domain.
   - Per‑project subdomains like `proj-<projectId>.apps.your-domain.com`.
   - Reverse proxy routes to appropriate app processes/ports.
   - PreviewManager already supports per‑project dev servers; production builds extend this idea.

This design gives us:

- A small **self‑hosted "mini Vercel + mini Supabase"** on top of Claudable.
- Clean separation between control plane, data plane, and app execution.
- A path to start with minimal features (no DB UI, simple auth) and gradually add more advanced management and visibility as needed.
