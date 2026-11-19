# Riot ID History

Track Riot ID, region, and ban changes for competitive leaderboard players.

The approved implementation plan lives in
`/home/teyd/.plannotator/plans/riot-id-history-implementation-2026-11-19-approved.md`.

## Commands

- `mise run install` — install dependencies
- `mise run dev` — API + web dev servers
- `mise run check` — effect-tsgo + Vite+ static checks
- `mise run test` — Vitest
- `mise run build` — production web build
- `mise run perf` — Playwright speed check against production
- `mise run serve` — run the API from TypeScript
- `mise run db:migrate` — apply committed migrations
- `mise run db:seed` — seed synthetic development data
- `mise run db:check` — check database invariants
- `mise run db:verify` — check migration history with Drizzle Kit
- `mise run scan` — run one leaderboard scan
- `mise run stats` — print database statistics
- `mise run backup` — create and rotate a consistent database backup
- `mise run backup:restore -- <file> --yes` — replace the database from a verified backup (stop the API first)
- `mise run db:prune` — delete runs older than the retention window
- `mise run anon:list` — show anonymous rows and match-cache totals
- `mise run anon:resolve` — run one budgeted identity-resolution pass
- `mise run anon:cache` — inspect the match cache (`-- --prune` to trim it)
- `mise run index:rebuild` — bump the API index version after manual changes
- `mise run player:show -- <puuid>` — print a player's timelines and link evidence
- `mise run player:remove -- <puuid> --yes` — redact a player for takedown

The in-process scheduler runs in production (`NODE_ENV=production`); during local development use `mise run scan` when you want a real scan.

## Riot auth

The Riot cookie jar lives in `./data/cookies.json` (`0600`), never in env.
The primary login is a Riot Mobile QR code:

```bash
mise run auth:login
```

Scan the QR (or open the printed URL on your phone), then the CLI verifies the
session and writes the jar. In production, run the same command from the
Dokploy terminal inside the app container:

```bash
node apps/api/src/cli.ts auth:login
```

If QR is not available, `mise run auth:save` accepts a pasted browser cookie
header, a Playwright/EditThisCookie JSON export, or a Netscape `cookies.txt`
file. `mise run auth:refresh` refreshes the access/entitlements tokens and writes the rotated cookie jar; `mise run auth:check` does the same and prints only the account region/expiry. The dev/prod server refreshes on boot when the jar is older than 45 minutes and every 45 minutes while running (`AUTH_REFRESH_MINUTES`), and every scan/probe starts with a refresh. `mise run probe` exercises the live leaderboard, name-service, MMR, match-history and match-details endpoints.

## Configuration

`.env.schema` is the only config contract. No `.env` or `.env.example` is
committed. Local secrets come from Infisical; production env comes from
Dokploy's Infisical integration.

## Architecture

- **Ingest** (`packages/ingest`): one run crawls `na/eu/ap/kr` page by page, resolves authoritative names in batches, de-duplicates page/cross-region overlaps, then applies player, name, region, ban, and anonymous-row diffs in one transaction. `runs` and `run_regions` keep the evidence.
- **Identity** (`packages/identity`): unresolved anonymous rows are the work queue. It reuses a 30-day match-candidate cache, seeds nearby leaderboard ranks from `leaderboard_seeds`, fetches a bounded number of new matches, and links only when the MMR fingerprint (rank, RR, wins, tier) matches exactly. Ambiguous candidates are never linked.
- **Database** (`packages/db`): SQLite in WAL mode with a read-only API connection and a read-write ingest/CLI connection. `player_names`, `player_regions`, and `banned_players` are interval tables; a nullable run id records which scan opened or closed an interval.
- **API** (`apps/api`): Hono with a read-only database, an in-memory ETagged index for players seen in the last 30 days, per-IP rate limits, gzip, security headers, and SPA fallback. It never calls Riot.
- **Web** (`apps/web`): React 19 + TanStack Router/Query/Virtual, virtualized master-detail list, timelines, link evidence, stats and status pages.

## API

| Endpoint                     | Purpose                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /api/v1/index`          | Versioned tuple index for public players (banned and unresolved anonymous rows excluded) |
| `GET /api/v1/players/:puuid` | Current player, name/region/ban timelines, counters, identity evidence                   |
| `GET /api/v1/stats`          | Totals, region cards, tier/RR aggregates, recent changes, anonymous coverage             |
| `GET /api/v1/status`         | Readiness, database/index versions, latest run, cookie-jar age                           |
| `GET /healthz`               | Minimal database readiness                                                               |

Index and detail responses carry `ETag` and support `If-None-Match` (`304`). Errors use `{ error: { code, message, requestId } }`.

## Live deployment

Production runs at **https://riotid.teyd.dev** on Dokploy. The application uses
the `Dockerfile` build (GitHub source, branch `main`), a named volume
`riotid-data` mounted at `/app/data`, and a Let's Encrypt domain through
Cloudflare. The production scheduler runs a scan every 6 hours, catches up on
boot, resolves anonymous rows continuously, and writes a rotated backup after ten
minutes and then every 24 hours.

Deploy the current repository branch with `mise run deploy` (it reads the Dokploy key from `~/.config/opencode/secrets/dokploy-api-key`). Scans, identity passes, backups, and the schema check run from the container terminal:

```bash
cd /app
node apps/api/src/cli.ts scan
node apps/api/src/cli.ts anon:resolve
node apps/api/src/cli.ts db:check
node apps/api/src/cli.ts backup
```

The crawler page streams the live match-candidate cache at `/crawler` via
`GET /api/v1/crawler/stream` (SSE); `GET /api/v1/crawler` returns the same
snapshot for first paint.

The leaderboard scan is always the priority. The crawler runs continuously in
small batches fifteen minutes apart, pauses while a scan runs, and yields if one
starts mid-batch. Requests are paced at 150 ms, capped at 8 rows and 24 new match details per batch, and 5,000 Riot requests per day; 429/5xx
responses retry with exponential backoff. When the daily budget is spent, the
crawler schedules its next batch for 00:00 UTC instead of spinning.

## Interface

The shell is pure black with hairline borders, the player list is a resizable
master pane (saved by ui-sdk `Resizable`), and the detail pane takes the rest of
the width. Stats, crawler, and status use Recharts for colored activity charts;
the status page renders recent pipeline runs with ui-sdk `Waterfall`.

## Deploy (Dokploy)

1. Create or reuse the Dokploy project/environment, then create an application from this repository using the `Dockerfile` build.
2. Persist a volume at **`/app/data`**. The SQLite database, cookie jar, and backups all live there; no database service is required.
3. Set the production environment from `.env.schema`: `NODE_ENV=production`, `PORT=3000`, `PUBLIC_ORIGIN=https://riotid.teyd.dev`, `DATABASE_PATH=/app/data/riotid.db`, `COOKIE_FILE=/app/data/cookies.json`, `BACKUP_DIRECTORY=/app/data/backups`. Keep Riot credentials only in the cookie jar.
4. Attach the `riotid.teyd.dev` domain in Dokploy. Cloudflare should proxy it with WAF managed rules and rate limits; the app limiter is defense in depth.
5. First boot applies migrations. Authenticate once from the container terminal:

   ```bash
   node apps/api/src/cli.ts auth:login
   node apps/api/src/cli.ts scan
   node apps/api/src/cli.ts anon:resolve
   ```

6. The production scheduler runs scans every `SCAN_INTERVAL_HOURS`, catches up on boot, and runs continuous crawler batches until the daily Riot budget is spent. Verify with `node apps/api/src/cli.ts status`.

Single instance only: the run lock and SQLite writer assume one process. Deploy with stop-first; do not scale replicas.

## Runbook

| Task            | Action                                                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cookie rotation | `node apps/api/src/cli.ts auth:login` (QR) or `auth:save`; the server refreshes automatically every 45 minutes while running.                                           |
| Scan failed     | Inspect `node apps/api/src/cli.ts status` and the `runs.error`/`run_regions` rows. Fix auth/network, then `scan`. A failed region never applies partial data.           |
| Backup          | `node apps/api/src/cli.ts backup`; snapshots live in `/app/data/backups` and rotate after 7 days.                                                                       |
| Restore         | Stop the app, run `backup:restore <file> --yes`, then start it. The command verifies `pragma integrity_check` and bumps the index version.                              |
| Reindex         | `node apps/api/src/cli.ts index:rebuild`; the API rebuilds on its next index request.                                                                                   |
| Takedown        | `node apps/api/src/cli.ts player:remove <puuid> --yes`; deletes the player and cascaded history, and marks their anonymous rows `ignored` so they are not re-linked.    |
| Pause scheduler | Temporarily set `NODE_ENV` away from `production` or stop the app. Manual commands still work.                                                                          |
| Identity policy | Only exact rank + RR + wins + tier matches are linked; ambiguous rows stay unresolved. Every link stores match id, method, confidence, and fingerprint evidence.        |
| Incident        | The API is read-only; if it is unhealthy, the last index is still served until restart. Restore the database from the newest verified backup if SQLite integrity fails. |

## Data retention

- Players seen in the last `INDEX_RETENTION_DAYS` are in the public index; older players remain in the database and are reachable by direct link.
- Runs older than `RUN_RETENTION_DAYS` are pruned; interval provenance becomes `NULL` instead of deleting history.
- Match candidates expire after `MATCH_CACHE_DAYS` and are capped per region, with adaptive growth up to `MATCH_CACHE_MAX_MATCHES_PER_REGION`.

## Tests

Manual smoke data uses `goombastomper28#teyd`; the demo seed includes it as the first player.

`mise run ci` runs static checks, all package tests, the web build, and Drizzle migration verification. The ingest and identity suites use temporary databases and fake Riot sources; they never call Riot.
