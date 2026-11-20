# Search at scale

Decision: server-side search and a capped index preview. The master list stays
visible; search results replace it while someone types.

## Why the old shape breaks

The index is a single JSON tuple array. At the 2026-11 production size, 37.5k
players cost 4.1 MB decoded and 1.4 MB Brotli. The 500k projection, measured on
a synthetic high-entropy set, is 55.9 MB decoded and 14.4 MB Brotli. That is a
multi-second first load on a phone before React can render anything.

Substring search over the raw tables is also too slow:

| Query   | Current names (`LIKE`) | Past names (`LIKE`) |
| ------- | ---------------------: | ------------------: |
| `Main`  |                ~380 ms |            ~1060 ms |
| `Old`   |                ~380 ms |            ~1070 ms |
| `T9998` |                ~390 ms |            ~1080 ms |

Measurements: 500k players, 900k closed `player_names` rows, SQLite 3.54,
warm local database, single query. A server request would add JSON and network
time.

## What the prototype does

- `player_search` holds one row for the current name and one row per closed
  past name, with folded name, tag, combined ID, and kind.
- An FTS5 trigram table indexes those rows. Triggers keep it in sync on insert,
  update, and delete, so ingest and takedown paths need no extra job.
- `/api/v1/search?q=...` returns two groups: current and past. A past result
  carries the matched alias plus the player's current identity. Each group is
  deduplicated per player, so the same player can appear in both groups when
  the query matches both names. The past row shows the matched alias first and
  `now <current name>` below it.
- Exact and prefix matches use indexed `GLOB` ranges; substring matches use
  FTS5 with a `kind:` filter. Each group reads at most 100 candidates, ranks
  exact > name > tag > prefix > substring, then returns the top 20.
- `total` is a lower bound when `truncated` is true: common queries show `20+`
  rather than running a full count over hundreds of thousands of matches.
- The index preview is capped at `INDEX_PLAYER_LIMIT` (50k). At 50k it is about
  5.6 MB decoded and 1.4 MB Brotli, the same cost as today's 37.5k index.
  Search still covers every visible player, not just the preview.

## Measured search latency

Same 500k/900k database, seven warm runs per query, median (min–max):

| Query                |    p50 | Range       | Current shown | Past shown |
| -------------------- | -----: | ----------- | ------------: | ---------: |
| `Main` (common)      | 2.8 ms | 2.7–14.2 ms |            20 |         20 |
| `Old` (past-only)    | 2.1 ms | 1.7–3.3 ms  |             0 |         20 |
| `T9998` (tag)        | 4.9 ms | 4.8–5.8 ms  |            20 |         20 |
| `Ascent Main 250000` | 2.0 ms | 2.0–2.2 ms  |             1 |          0 |
| `legacy` (no hits)   | 1.2 ms | 1.2–1.5 ms  |             0 |          0 |

The limiter is the database read path, not JSON: responses are at most 40
results. Keep the candidate cap in mind before claiming an exact total; a full
count is the slow path this design deliberately avoids.

The search index adds disk: this synthetic database is 834 MB for 500k players,
900k past names, indexes, and FTS. The migration's one-time FTS rebuild took
5.6 s at 1.4M terms on the benchmark machine.

## Browse now pages too

The SPA no longer downloads the index preview. It requests `/api/v1/overview`
for counts and `/api/v1/players?sort=...&cursor=...` for 250-row keyset pages,
with the full sort key plus puuid in the cursor. The capped index remains for
API consumers; search stays independent and complete.
