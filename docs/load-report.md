# Load test — 2026-11-19

> [!NOTE]
> Historical report. The stats and crawler endpoints and their pages were removed
> after this measurement. The numbers are kept as a record of the old read path;
> the current API serves overview, cursor-paged players, search, index, player
> detail, status, and `/healthz`. The index is now capped at
> `INDEX_PLAYER_LIMIT` and browse is cursor-paged.

Target: p95 < 150 ms for API reads on the target VPS, with 50 concurrent readers.

Environment: local Linux workstation, Node 26.13.1, live database from a real scan
(34,728 public players, 10,332 unresolved anonymous rows). The index was warm in
the in-memory cache. Each run lasted 10 s with 50 concurrent workers. Runs were
consecutive, not interleaved with other load.

## Detail, stats, and status (the historical read path)

Mix: 50% player detail, 25% stats, 25% status.

| Run | Requests | Errors |     p50 |     p95 |     p99 |   RPS |
| --- | -------: | -----: | ------: | ------: | ------: | ----: |
| 1   |   13,739 |      0 | 35.5 ms | 58.7 ms | 69.6 ms | 1,374 |
| 2   |   14,800 |      0 | 33.5 ms | 72.1 ms | 92.2 ms | 1,480 |
| 3   |   14,771 |      0 | 33.5 ms | 55.4 ms | 63.0 ms | 1,477 |

RSS after the three runs: 272 MB.

**Decision:** the API read path meets p95 < 150 ms (worst observed p95: 72 ms).
The spread is 55–72 ms; the limiter is per-request SQLite detail queries and JSON
serialization, not memory. Do not add caching for detail until a real VPS
measurement shows it is needed.

## Index endpoint (bulk download)

`GET /api/v1/index` was measured separately because it returns the whole public
index: 1,289,876 bytes gzipped (about 1.29 MB). Response is pre-gzipped once per
version, so requests do not spend CPU on compression.

Mix: 100% index, 50 concurrent, 10 s.

| Run | Requests | Errors |      p50 |      p95 | RPS |
| --- | -------: | -----: | -------: | -------: | --: |
| 1   |    2,429 |      0 | 205.8 ms | 230.0 ms | 243 |
| 2   |    2,310 |      0 | 211.4 ms | 256.1 ms | 231 |
| 3   |    2,319 |      0 | 212.8 ms | 253.0 ms | 232 |

RSS after the runs: 202 MB. At ~230 index responses/s the test transfers about
300 MB/s over loopback; p95 here is bandwidth-bound, not application-bound.
Cloudflare proxies the site. At measurement time the index was
`cf-cache-status: DYNAMIC` (no Cache Rule), so every request in this test would
have reached the origin. The app limits it to 30/min/IP, and origin capacity was
the real limiter.

**Decision:** keep the full index (gzip under the 1.5 MB budget). A Cloudflare
Cache Rule (`riotid-index`) now caches `/api/v1/index` using the response's
`s-maxage=300`. Re-measure on the VPS through Cloudflare; if origin p95 for
cache misses still exceeds 300 ms, paginate it.

## Reproduce

```bash
DATABASE_PATH=./data/riotid.db PORT=8795 mise run serve
# with rate limits raised in a throwaway server for the load harness
```

The rate limiter is intentionally left at production values in the shipped app:
index 30/min/IP, overview/search/status 60/min/IP, and browse/detail 120/min/IP.
The removed stats endpoint was limited to 60/min/IP at the time of the test.
