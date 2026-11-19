# Riot ID History

Track Riot ID, region, and ban changes for competitive leaderboard players. See
[`README.md`](README.md) for product and deployment details and [`docs/`](docs/)
for reports.

## Layout

- `apps/api` — read-only Hono HTTP API (never writes, never calls Riot).
- `apps/cli` — Effect v4 CLI: auth, scans, identity passes, DB and backup jobs.
- `apps/scheduler` — Effect v4 daemon: spawns CLI jobs and supervises the API.
- `apps/web` — React 19 + TanStack Router/Query + Vite+ + UI SDK.
- `packages/*` — `config`, `contracts`, `db`, `ingest`, `identity`, `riot`, `test-utils`.

## Commands

Run these at the repository root; mise pins Node, pnpm, and worktrunk.

```bash
mise run install             # dependencies
mise run dev                 # API + web dev servers
mise run check               # effect-tsgo vp check + tsc
mise run test                # all workspace tests
mise run ci                  # check + test + web build
mise run build               # web production build
mise run db:generate         # Drizzle migration from schema changes
mise run db:migrate          # apply committed migrations
mise run db:check            # database invariants
mise run db:verify           # drizzle-kit migration check
wt switch --create <branch>  # isolated worktree with its own ports and data
```

Use `mise run fmt` and `mise run lint` for formatting and linting only. Static
checks must go through `effect-tsgo`; never call plain `vp check` in scripts.

## Invariants

- The API is read-only: use `readDatabase()` only and never import ingest or Riot
  code. Only the CLI holds a write connection; the scheduler reads status and
  spawns CLI jobs.
- One writer, one instance. Do not scale replicas; stop the API before a restore.
- Node 26 runs `.ts` directly: use explicit `.ts` relative imports and no enums.
- Effect diagnostics are errors. Keep services and layers typed; do not run
  effects inside effects or use global `fetch`/`console` inside `Effect`.
- `.env.schema` (Varlock) is the only config contract. No `.env.example` and no
  committed secrets; `.env`, `.env.local`, and `.env.worktree` stay local.
- Schema changes go through `drizzle-kit generate` plus committed SQL. Never
  hand-edit `snapshot.json` or an applied migration.
- Generated files (`apps/web/src/routeTree.gen.ts`, `packages/db/drizzle/**`) are
  rewritten by tools; do not edit them by hand.

## Scope notes

Nested `AGENTS.md` files in `apps/web`, `apps/scheduler`, and `packages/db` add
rules for those trees. Read the nearest one before editing there.

## Done

- `mise run ci` passes (or `mise run check` and `mise run test` for a focused change).
- New behavior has a use-case test; schema changes include a committed migration.
- `git diff --check` is clean and no secrets or generated edits are staged.
- Commit in conventional style after each phase, with no agent coauthor.
