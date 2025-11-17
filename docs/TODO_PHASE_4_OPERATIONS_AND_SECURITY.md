# Phase 4 – Operations, Security & AI Runtime Hardening TODO

This phase focuses on **stabilizing and hardening** the self-hosted platform: monitoring, security, and robustness around Claude/Codex runtimes.

> Goal: make the self-hosted Claudable deployment safe and operable in production for multiple users.

---

## 1. Logging & Monitoring

- [ ] Centralize logs
  - [ ] Capture logs from:
    - [ ] Claudable control plane (Next.js / API routes)
    - [ ] Project app processes
    - [ ] Postgres provisioning
    - [ ] AI runtimes (Claude, Codex)
  - [ ] Consider a simple log collector / file rotation strategy
- [ ] Basic metrics
  - [ ] Per-project:
    - [ ] Number of deploys
    - [ ] Last deploy status
    - [ ] Preview & production uptime snapshots
  - [ ] Per-node:
    - [ ] CPU, memory, disk usage (external tools are fine)

---

## 2. Security Hardening

- [ ] Authentication & sessions
  - [ ] Enforce secure cookies in production
  - [ ] Configure proper `sameSite` / `domain` attributes
  - [ ] Add basic lockout / throttling for repeated failed logins
- [ ] Authorization
  - [ ] Double-check all project‑scoped APIs enforce ownership checks
  - [ ] Verify that internal provisioning endpoints are never exposed to the browser
- [ ] Secrets management
  - [ ] Ensure admin DB credentials and AI API keys are not logged
  - [ ] Consider using a secrets store or at least environment-only configuration

---

## 3. Claude Code & Codex Runtime Safety

- [ ] Claude Code (`lib/services/cli/claude.ts`)
  - [ ] Review error handling for:
    - [ ] Missing CLI
    - [ ] Auth errors
    - [ ] Permission issues on project directories
    - [ ] Token limits / model errors
  - [ ] Ensure stderr logs from the SDK are captured but not exposed directly to end users
- [ ] Codex CLI (`lib/services/cli/codex.ts`)
  - [ ] Review sandboxing:
    - [ ] Confirm paths are restricted to allowed project directories
    - [ ] Ensure `PROJECTS_DIR` is correctly enforced
  - [ ] Harden handling of:
    - [ ] JSON parse failures
    - [ ] Unexpected event types
    - [ ] Long‑running or stuck processes
  - [ ] Confirm we never leak raw secrets in tool messages or logs

---

## 4. Resource Management

- [ ] Process limits
  - [ ] Cap the number of simultaneously running project apps per node
  - [ ] Decide behavior when limits are reached (queue, reject, or scale manually)
- [ ] Disk usage
  - [ ] Track total size of `PROJECTS_DIR` and per‑project repositories
  - [ ] Add policies for cleaning up old preview builds or abandoned projects
- [ ] Database cleanup
  - [ ] Optionally implement a cleanup flow:
    - [ ] Deleting a project can drop its database and user (or mark for manual review)

---

## 5. Operational Playbooks

- [ ] Document standard operations
  - [ ] How to:
    - [ ] Deploy a new version of Claudable
    - [ ] Restart project apps
    - [ ] Rotate admin DB credentials
    - [ ] Replace AI API keys / reconfigure Claude/Codex
- [ ] Backup & restore
  - [ ] Define backup strategy for:
    - [ ] Claudable metadata DB
    - [ ] Per‑project application DBs
  - [ ] Test restores in a staging environment

When this phase is complete, the self-hosted Claudable deployment should be:

- Reasonably safe for multi-user usage
- Observable and debuggable
- Ready to evolve with more advanced features (custom domains, DB UI, etc.)

