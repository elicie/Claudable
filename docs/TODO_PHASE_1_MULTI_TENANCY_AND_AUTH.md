# Phase 1 – Multi-Tenancy & Authentication TODO

This phase introduces **real users** and **per-user projects** so that later phases (DB provisioning, app hosting) can cleanly attach to a specific user and project.

> Goal: turn the current single-tenant Claudable into a basic multi-tenant control plane with login, and scope all operations by user.

---

## 1. Schema & Data Model

- [ ] Add `User` model to `prisma/schema.prisma`
  - [ ] Fields: `id`, `email`, `name`, `passwordHash`, timestamps
  - [ ] Unique index on `email`
- [ ] Add ownership to `Project`
  - [ ] Add `ownerId` field mapped to `owner_id`
  - [ ] Add relation: `owner User @relation(fields: [ownerId], references: [id])`
  - [ ] Add index on `(ownerId, created_at)`
- [ ] Migrations
  - [ ] Decide how to handle existing projects (single-tenant dev data)
    - [ ] Option A: create a default `User` and assign all existing projects
    - [ ] Option B: clear data and start fresh for self-hosted deployment
  - [ ] Generate and apply Prisma migration

---

## 2. Authentication Backend

- [ ] Choose auth style
  - [ ] Simple email/password with password hash
  - [ ] Cookie-based session (HttpOnly) or signed JWT stored in cookie
- [ ] Implement signup API
  - [ ] `POST /api/auth/signup`
  - [ ] Validate email/password
  - [ ] Hash password (e.g. bcrypt/argon2)
  - [ ] Create `User` record
  - [ ] Return minimal user info + set session cookie
- [ ] Implement login API
  - [ ] `POST /api/auth/login`
  - [ ] Validate credentials against stored hash
  - [ ] Set/refresh session cookie
- [ ] Implement logout API
  - [ ] `POST /api/auth/logout`
  - [ ] Clear session cookie
- [ ] Session verification helper
  - [ ] Utility to parse cookie, verify token, and fetch `currentUser`
  - [ ] Make it reusable from Next.js route handlers

---

## 3. Request Context & Access Control

- [ ] Introduce a central helper for API routes
  - [ ] Wrap `NextRequest` to attach `currentUser` (or `null`)
  - [ ] Provide helpers like `requireUser(request)` that throw 401 when unauthenticated
- [ ] Scope project queries by owner
  - [ ] `getProjectById` should accept `userId` and enforce `ownerId = userId`
  - [ ] Project listing APIs should filter by `ownerId`
  - [ ] Project mutations (update/delete) must verify ownership
- [ ] Update existing APIs to use the new helpers
  - [ ] Chat/act route
  - [ ] Preview routes
  - [ ] Service integration routes (GitHub only) – at least enforce ownership

---

## 4. Frontend Auth Flow

- [ ] Add minimal auth UI
  - [ ] Sign up page/form
  - [ ] Login page/form
  - [ ] Simple header UI showing “logged in as …” and “Logout”
- [ ] Protect main Claudable UI
  - [ ] If not logged in → redirect to login page
  - [ ] Ensure project list and project detail pages only show user’s own projects
- [ ] Store minimal user state on the client
  - [ ] `useCurrentUser` hook or context
  - [ ] Load current user info from `/api/auth/me` or similar

---

## 5. Environment & Deployment Notes

- [ ] Decide on metadata DB for Claudable itself
  - [ ] For real deployments, prefer Postgres over SQLite
  - [ ] Set `DATABASE_URL` accordingly
- [ ] Configure secure cookie settings
  - [ ] `secure`, `sameSite`, `httpOnly`, and appropriate cookie name
  - [ ] Domain configuration for self-hosted environment
- [ ] Add basic rate-limiting or bruteforce protection on auth endpoints (optional but recommended)

When this phase is complete, we have:

- Real users, login, and per-user projects
- All project operations scoped by owner
- A solid foundation to attach per-project Postgres DBs and hosted apps in later phases
