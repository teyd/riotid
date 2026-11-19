# Live Riot probe — 2026-11-19

Run with the QR-authenticated EU account and the stored `./data/cookies.json`.
Tokens, PUUIDs, Riot IDs, and cookie values are intentionally omitted.

## Full crawl

| Region |   rows | pages | unique PUUIDs | empty PUUID | anonymized | banned | page overlaps |
| ------ | -----: | ----: | ------------: | ----------: | ---------: | -----: | ------------: |
| na     |  9,344 |    19 |         7,772 |       1,572 |      1,572 |      0 |             0 |
| eu     | 15,300 |    30 |        11,970 |       3,330 |      3,330 |      0 |             0 |
| ap     | 15,300 |    30 |        10,928 |       4,370 |      4,370 |      0 |             2 |
| kr     |  5,100 |    10 |         4,039 |       1,061 |      1,061 |      0 |             0 |

- 34,708 unique PUUIDs; **1 cross-region overlap** total.
- EU/AP report `totalPlayers=15,000` while returning 15,300 rows. Treat `totalPlayers` as advisory and terminate on an empty page, not on the reported total.
- `name-service` 10,000-PUUID batches all succeeded: EU 10,000/10,000, AP 10,000/10,000, NA 7,772/7,772, KR 4,039/4,039.
- Anonymized rows are 17–29% of each region's rows; their `puuid`, `gameName`, and `tagLine` are present as **empty strings**. The direct-PUUID path is not usable; the match-graph resolver is required.
- `mmr`, `match-history`, and `match-details` work. Match details expose `subject`, `gameName`, `tagLine`, `playerCard`, `playerTitle`, `accountLevel`, `competitiveTier`.
- Client `release-13.10-shipping-18-5893614`; active act `ACT VI`.

## Implementation findings

- Node `fetch` lowercases header names. Riot's PD service rejects that with `INVALID_HEADERS` even when all four required headers are present. Effect's `NodeHttpClient` (node:http) preserves header case and returns 200. All PD calls use `NodeHttpClient.layerNodeHttp`.
- `RIOT_CLIENT_PLATFORM` is a static client fingerprint; the docs' Windows base64 value works live. Dynamic OS detection would report Linux and be invalid. Only `X-Riot-ClientVersion` is fetched dynamically.
- `cookie reauth` returns fresh access/ID tokens and `Set-Cookie`; the merged jar must be written back after every refresh. `refreshSession` does this. The server refreshes on boot when the jar is older than 45 minutes and every 45 minutes while running; scans/probes refresh before use.
- Access/ID tokens expire after 3,600s; the cookie jar is the long-lived secret. If the jar is unused for weeks it can expire and needs QR sign-in again.
