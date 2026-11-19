# Runbook

Operator commands for Riot ID History. Local commands run through mise:

```bash
mise run cli -- <command> [args]
```

Inside the production container there is no mise or Varlock wrapper; environment
is injected by Dokploy, so run the CLI directly from `/app`:

```bash
node apps/cli/src/main.ts <command> [args]
```

Every write command assumes the scheduler is not running. See
[architecture](architecture.md) for the single-writer invariant and
[configuration](configuration.md) for variable meanings.

## Before you start

- Local paths resolve from the repository root: `./data/riotid.db`,
  `./data/cookies.json`, `./data/backups`.
- Production paths live on the mounted volume: `/app/data/...`.
- Confirm one writer. A manual scan against a live production scheduler will
  collide with its jobs.
- `mise run db:migrate` applies committed migrations; the runtime also migrates
  on startup.

## Riot auth

The cookie jar is the long-lived credential. Access tokens expire in about an
hour; the scheduler refreshes the jar before Riot work.

```bash
mise run cli -- auth:login      # QR login; scan with Riot Mobile
mise run cli -- auth:save jar.txt   # import pasted cookies, JSON export, or cookies.txt
mise run cli -- auth:check      # refresh and print account region/expiry
mise run cli -- auth:refresh    # refresh tokens and rewrite the rotated jar
mise run cli -- probe           # exercise leaderboard, names, MMR, matches
```

`auth:save` with no file argument reads stdin. The jar is written `0600` to
`COOKIE_FILE`. If QR login is unavailable, paste a browser cookie header or a
cookie export file.

In the container:

```bash
cd /app
node apps/cli/src/main.ts auth:login
node apps/cli/src/main.ts auth:check
```

Rotate immediately if the jar is exposed: run `auth:login` again. The old jar
stops working once Riot invalidates the session.

## Scan

```bash
mise run cli -- scan
mise run cli -- scan --json
```

A scan refreshes auth, walks `na`, `eu`, `ap`, and `kr` until each region returns
an empty page, resolves names in batches, de-duplicates overlaps, and applies one
transaction. A failed region fails the run; nothing partial is applied.

The runtime applies migrations first. A manual scan uses trigger `manual`, so it
is distinguishable from `boot` and `schedule` runs.

Inspect the latest runs with a read-only query:

```bash
node --input-type=module -e "import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync('data/riotid.db',{readOnly:true});console.table(db.prepare('select id,status,trigger,error,started_at from runs order by id desc limit 5').all())"
```

Use `data/riotid.db` locally and `/app/data/riotid.db` in the container. Per-region
counts and errors are in `run_regions`.

## Identity

```bash
mise run cli -- anon:list
mise run cli -- anon:resolve
mise run cli -- anon:resolve --limit 100
mise run cli -- anon:cache
mise run cli -- anon:cache --prune
```

`anon:list` prints unresolved, linked, and ignored counts per region plus cache
totals. `anon:resolve` runs one bounded pass and prunes expired candidates;
`--limit` caps rows attempted. `anon:cache --prune` trims the cache without
resolving.

Policy: link only on an exact rank, ranked rating, wins, and tier fingerprint.
Ambiguous candidates stay `unresolved` and are retried later. Never lower this
to a nearest match, and never link rows marked `ignored` by a takedown.

## Backup and restore

```bash
mise run cli -- backup
mise run cli -- backup:restore data/backups/<file> --yes
```

`backup` uses SQLite's online backup API, writes into `BACKUP_DIRECTORY`, and
prunes files older than `BACKUP_KEEP_DAYS`. It is safe while the API runs.

Restore is destructive and offline:

1. Stop the scheduler and API (Dokploy stop, or `docker compose stop riotid`).
2. Run `backup:restore` with an explicit file and `--yes`; it checks
   `pragma integrity_check`, replaces the database, and bumps the index version.
3. Start the service and verify `/healthz` and `stats`.

In the container:

```bash
cd /app
node apps/cli/src/main.ts backup
node apps/cli/src/main.ts backup:restore /app/data/backups/<file> --yes
```

## Reindex

```bash
mise run cli -- index:rebuild
```

Bumps `meta.indexVersion`. The API rebuilds its in-memory index on the next
request. Use after manual data repair or a restore. No restart is needed.

## Takedown

```bash
mise run cli -- player:show <puuid>
mise run cli -- player:remove <puuid> --yes
```

`player:show` prints timelines and link evidence for review.
`player:remove` deletes the player and cascaded history, marks their anonymous
rows `ignored` so they cannot be re-linked, and bumps the index version. Verify
the row is gone from `/api/v1/players/<puuid>` and from the next index response.

## Retention

```bash
mise run cli -- db:prune
```

`db:prune` deletes runs older than `RUN_RETENTION_DAYS`. Interval rows keep their
history; their run provenance becomes `NULL` through `ON DELETE SET NULL`. The
scheduler does this as part of aftercare after a backup.

Other windows:

- `INDEX_RETENTION_DAYS`: last-seen window for the public index.
- `MATCH_CACHE_DAYS`: expiry for match candidates.
- `BACKUP_KEEP_DAYS`: rotated backup files.

## Deployment and scheduler

Deploy with `mise run deploy`, which calls the Dokploy API. The build uses the
repository `Dockerfile`; the container entrypoint is the scheduler:

- It starts the API as a child process and exposes `PORT=3000`.
- On boot it catches up a missed scan, refreshes auth, then scans every
  `SCAN_INTERVAL_HOURS`.
- It runs identity passes in bounded batches, pausing while a scan runs and
  resuming at 00:00 UTC when `ANON_RESOLVE_BUDGET` is spent.
- It backs up shortly after boot and at most once per 24 hours, then prunes runs.

The database, cookie jar, and backups live on the `/app/data` volume. Run
maintenance commands from the Dokploy container terminal using the
`node apps/cli/src/main.ts` form. Single instance only: stop-first deploys, no
replicas, no second scheduler.

Health check after deploy:

```bash
curl -fsS https://riotid.teyd.dev/healthz
node apps/cli/src/main.ts stats
```

## Incidents

| Symptom                 | Action                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Scan failed             | Read `runs.error` and `run_regions`; run `auth:check` and `probe`; fix auth or network, then `scan`. Previous data is intact. |
| Auth missing or expired | Run `auth:login`, or `auth:save` with a fresh export. Confirm with `auth:check`.                                              |
| Riot 429/5xx            | Stop retrying manually. The scheduler backs off and resumes at 00:00 UTC when the budget is spent; do not parallelize.        |
| Database check failed   | Run `db:check` and `backup`, then restore the newest verified backup if integrity fails. Stop writers first.                  |
| API unhealthy, DB fine  | The API is read-only; the last index survives until restart. Restart the container and check `/healthz`.                      |
| Suspected double writer | Stop one process immediately. Check for stuck `running` runs; a restart marks interrupted runs failed.                        |
| Credential leak         | Rotate with `auth:login`; rotate Infisical client credentials; review logs for the leaked value.                              |

Before deploying, run `mise run ci` and `mise run db:check`.
