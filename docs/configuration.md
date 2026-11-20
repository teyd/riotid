# Configuration

Configuration has one contract: [`.env.schema`](../.env.schema). It is validated
by Varlock, committed, and read by every app. There is no `.env.example`; a
template that drifts from the contract is worse than none.

## Rules

- Add or change a variable in `.env.schema`, never in application code.
- Real values live in untrusted local `.env` / `.env.local` files or in
  Infisical through the Varlock plugin. Never commit them.
- Mark secrets `@sensitive`; never print or log a resolved secret.
- The Riot cookie jar is a secret file (`0600`), not an environment variable.
- Production values are set in Dokploy from the same schema.

## Variables

| Variable                               | Default                 | Purpose                                                                     |
| -------------------------------------- | ----------------------- | --------------------------------------------------------------------------- |
| `NODE_ENV`                             | `development`           | Runtime mode; production disables dev seeding and enables prod behavior     |
| `PORT`                                 | `8787`                  | API listen port                                                             |
| `WEB_PORT`                             | `5173`                  | Vite dev server port                                                        |
| `PUBLIC_ORIGIN`                        | `http://localhost:5173` | Public web origin printed by status and startup logs                        |
| `DATABASE_PATH`                        | `./data/riotid.db`      | SQLite file for all app and CLI processes                                   |
| `COOKIE_FILE`                          | `./data/cookies.json`   | Riot cookie jar written by auth commands                                    |
| `RIOT_COUNTRY_CODE`                    | `US`                    | Country sent during Riot QR login                                           |
| `RIOT_QR_TIMEOUT_SECONDS`              | `300`                   | How long `auth:login` waits for a QR scan                                   |
| `AUTH_REFRESH_MINUTES`                 | `45`                    | Token refresh interval for running processes and stale checks               |
| `SCAN_INTERVAL_HOURS`                  | `6`                     | Scheduled leaderboard scan interval                                         |
| `SCHEDULER_JOBS`                       | `true`                  | Set `false` to start the API under the scheduler without spawning Riot jobs |
| `SCHEDULER_DRY_RUN`                    | `false`                 | Log jobs instead of spawning them; safe for smoke tests                     |
| `SCHEDULER_IDENTITY_LIMIT`             | `8`                     | Rows attempted per identity pass                                            |
| `SCHEDULER_IDENTITY_ACTIVE_MINUTES`    | `15`                    | Delay after an identity pass that tried work                                |
| `SCHEDULER_IDENTITY_IDLE_MINUTES`      | `30`                    | Delay after an identity pass with no work or a failure                      |
| `SCHEDULER_MAINTENANCE_DELAY_MINUTES`  | `10`                    | Boot delay before the first backup and prune                                |
| `SCHEDULER_MAINTENANCE_INTERVAL_HOURS` | `24`                    | Backup and prune interval                                                   |
| `ANON_RESOLVE_BUDGET`                  | `5000`                  | Daily cap on Riot requests spent on identity resolution                     |
| `ANON_SEEDS`                           | `20`                    | Nearby leaderboard seeds used per identity pass                             |
| `ANON_COVERAGE_TARGET`                 | `0.9`                   | Coverage target that lets the match cache grow                              |
| `MATCH_CACHE_ENABLED`                  | `true`                  | Reuse stored match candidates before fetching new matches                   |
| `MATCH_CACHE_MATCHES_PER_REGION`       | `1000`                  | Initial match-candidate cap per region                                      |
| `MATCH_CACHE_MAX_MATCHES_PER_REGION`   | `10000`                 | Hard cap when autotune grows the cache                                      |
| `MATCH_CACHE_AUTOTUNE`                 | `true`                  | Grow the cache while coverage stays under the target                        |
| `MATCH_CACHE_DAYS`                     | `30`                    | Age after which cached match candidates are pruned                          |
| `INDEX_RETENTION_DAYS`                 | `30`                    | Players seen within this window stay in the public index                    |
| `INDEX_PLAYER_LIMIT`                   | `50000`                 | Public index preview cap; search still covers every visible player          |
| `BACKUP_DIRECTORY`                     | `./data/backups`        | Destination for rotated SQLite backups                                      |
| `BACKUP_KEEP_DAYS`                     | `7`                     | Backup retention window                                                     |
| `RUN_RETENTION_DAYS`                   | `180`                   | Run evidence retention before `db:prune`                                    |
| `INFISICAL_PROJECT_ID`                 | unset                   | Optional Infisical project for the Varlock plugin                           |
| `INFISICAL_CLIENT_ID`                  | unset                   | Sensitive Infisical machine identity                                        |
| `INFISICAL_CLIENT_SECRET`              | unset                   | Sensitive Infisical machine secret                                          |

Relative paths resolve from the repository root, not from the current
directory, so CLI commands behave the same from any folder.

## Worktree ports

Worktrunk's `pre-start` hook generates `.env.worktree` (git-ignored) and mise
loads it through `[env] _.file`. Do not edit or commit it.

| Key             | Source                       |
| --------------- | ---------------------------- |
| `PORT`          | Hash of `<branch>-api`       |
| `WEB_PORT`      | Hash of `<branch>`           |
| `PUBLIC_ORIGIN` | `http://localhost:$WEB_PORT` |

Each worktree also receives a copy of untracked env files, installed
dependencies, a consistent SQLite snapshot (online backup), the cookie jar, and
backups. The hook prints both URLs; `wt remove` cleans up.

## Local and production paths

| Data       | Local                 | Production               |
| ---------- | --------------------- | ------------------------ |
| Database   | `./data/riotid.db`    | `/app/data/riotid.db`    |
| Cookie jar | `./data/cookies.json` | `/app/data/cookies.json` |
| Backups    | `./data/backups`      | `/app/data/backups`      |

The container mounts one volume at `/app/data`. Everything mutable belongs
there; keep the image filesystem disposable.

## Secret flow

1. `.env.schema` declares names, defaults, types, and sensitivity.
2. Local: Varlock resolves `.env` / `.env.local` or the Infisical plugin.
3. Production: Dokploy injects values from its Infisical integration.
4. Riot credentials: obtain once with `auth:login`; the jar is written to
   `COOKIE_FILE` and refreshed in place. It never appears in env or logs.

If a value leaks into a command line or a log, rotate it: generate a new cookie
jar with `auth:login`, and rotate the Infisical client secret.
