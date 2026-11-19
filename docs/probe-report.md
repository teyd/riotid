# Live Riot probe — 2026-11-19

Run with the QR-authenticated EU account and the stored `./data/cookies.json`.
Tokens, PUUIDs, Riot IDs, and cookie values are intentionally omitted.

## Results

- Auth: region `eu`, reauth succeeded, cookie jar refreshed and persisted.
- Client: `release-13.10-shipping-18-5893614`; active act `ACT VI`.
- Leaderboards (one account, cross-region): `na` 200 / 9,343 total; `eu` 200 / 15,000; `ap` 200 / 15,000; `kr` 200 / 5,000.
- Pagination: `size=510` returns 510 rows on pages 0, 1 and 2; `totalPlayers` is stable.
- `name-service`: an 833-PUUID batch returned 833 rows.
- `mmr`: returned current-act leaderboard rank/RR/wins/tier.
- `match-history` + `match-details`: returned matches and 10 players with `subject`, `gameName`, `tagLine`, `playerCard`, `playerTitle`, `accountLevel`, `competitiveTier`.
- Anonymized rows: first EU page (100 rows) had 8 `IsAnonymized` rows at ranks 17, 20, 32, 38, 63, 69, 75, 99. The JSON keys exist, but `puuid`, `gameName`, and `tagLine` are empty strings, so the direct-PUUID path is not usable; the match-graph resolver is required.

## Implementation findings

- Node `fetch` lowercases header names. Riot's PD service rejects that with `INVALID_HEADERS` even when all four required headers are present. Effect's `NodeHttpClient` (node:http) preserves header case and returns 200. All PD calls use `NodeHttpClient.layerNodeHttp`.
- `cookie reauth` returns fresh access/ID tokens and `Set-Cookie`; the merged jar must be written back after every refresh. `refreshSession` does this, and the server runs a 6h keepalive refresh.
- Access/ID tokens expire after 3,600s; the cookie jar is the long-lived secret. Refreshing every scan (and every 6h while the server runs) keeps it alive; if the jar is unused for weeks it can expire and needs QR sign-in again.
