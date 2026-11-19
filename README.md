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
- `mise run serve` — run the API from TypeScript

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
file. `mise run auth:refresh` refreshes the access/entitlements tokens and writes the rotated cookie jar; `mise run auth:check` does the same and prints only the account region/expiry. The running server also refreshes every 6h (`AUTH_KEEPALIVE_HOURS`), and every scan starts with a refresh. `mise run probe` exercises the live leaderboard, name-service, MMR, match-history and match-details endpoints.

## Configuration

`.env.schema` is the only config contract. No `.env` or `.env.example` is
committed. Local secrets come from Infisical; production env comes from
Dokploy's Infisical integration.
