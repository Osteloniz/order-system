# Order System Instructions

## Read First
- Read `PROJECT_CONTEXT.md` before making non-trivial changes.

## Stack Snapshot
- Next.js App Router
- React 19
- Prisma + Postgres/Neon
- NextAuth credentials auth

## Local Runtime
- Prefer Node.js `22.22.3` in local development for this repository.
- Avoid Node `24.13.1` on this Windows setup because CLI tools may crash before the app starts.

## Working Priorities
- Production bugs first.
- Protect auth, tenant, stock, and payment flows from regressions.
- If persistence behavior changes, note any migration or backfill need.

## Release Discipline
- Always validate in HML before PRD.
- If Prisma schema or migrations changed, update HML database first, validate, then update PRD database before or alongside deploy.
- If only frontend, API behavior, docs, or local tooling changed, do not force a PRD database update.
- If `ContaPagar` persistence changes, check whether a migration also requires backfilling legacy supplier text into structured financial suppliers.

## Quick Checks
- `rtk npm run build`
- `rtk npm run lint`
- `rtk npm run test:auth-security`

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
