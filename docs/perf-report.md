# Performance report — 2026-11-19

> [!NOTE]
> Historical report. The UI, endpoints, and build have changed since this
> measurement. The SPA now loads a capped overview plus cursor-paged players
> instead of the full index. Timings are preserved; see the [runbook](runbook.md)
> for current commands and [architecture](architecture.md) for the current
> surface.

Decision: keep the full public index and optimize the browser/client path. The
target is p95 < 150 ms for normal API reads (already met) and a first usable
list under 2 s on a warm connection.

Environment: production `https://riotid.teyd.dev`, Chromium headless at
1440×900, 35k-player index. Measurements are three fresh browser launches; the
spread is shown rather than a single number. The cold run includes Chromium's
first TLS/connection path; warm runs reuse the network path.

## Baseline (before the layout fix)

| Metric               |   Value |
| -------------------- | ------: |
| DOM nodes            | 523,448 |
| JS heap              |  296 MB |
| Rows in DOM          |  34,703 |
| Keyboard `j` latency |  236 ms |
| Ready                |   7.8 s |
| SaaS index transfer  | 1.79 MB |
| CLS                  |   0.063 |

Root cause: the app shell used `min-h-dvh` with auto-height grid rows, so the
scroll container grew to every row. TanStack Virtual saw a 1.4-million-pixel
viewport and rendered the entire list.

## After the layout and data fixes

The shell is now `h-dvh` + `overflow-hidden`, the list is constrained, and only
~20 rows are rendered (~312 DOM nodes). Other changes: an idle-prefetched
detail chunk, keyboard-accessible splitter, preconnect for card art, image
dimensions/async decoding, Brotli index responses, tuple trimming, and a
card-id dictionary.

| Metric         | Run 1 (cold-ish) |       Run 2 |       Run 3 |   Median |
| -------------- | ---------------: | ----------: | ----------: | -------: |
| Ready          |         2,491 ms |    1,086 ms |    1,029 ms | 1,086 ms |
| FCP            |           280 ms |      292 ms |      200 ms |   280 ms |
| LCP            |         1,892 ms |      488 ms |      424 ms |   488 ms |
| CLS            |           0.0003 |      0.0003 |      0.0003 |   0.0003 |
| Index encoded  |      1,280,091 B | 1,280,091 B | 1,280,091 B |  1.28 MB |
| Index decoded  |      3,667,569 B | 3,667,569 B | 3,667,569 B |  3.67 MB |
| Index duration |         1,585 ms |      174 ms |      197 ms |   197 ms |
| Keyboard `j`   |           4.7 ms |      5.0 ms |      5.0 ms |   5.0 ms |
| Search update  |          15.4 ms |     15.1 ms |     12.3 ms |  15.1 ms |
| DOM nodes      |              312 |         312 |         312 |      312 |

Index transfer dropped from 1.79 MB to 1.28 MB (28%) and decoded JSON from
5.2 MB to 3.67 MB (29%). Normal interaction latency is now below one frame on
this machine.

## Limiter

The remaining cold first-load time is the index transfer, not React: the first
run spent 1.6 s downloading the index; warm runs spent 0.17–0.20 s. The origin
index is served Brotli-compressed and cached in-process. At measurement time
Cloudflare reported `cf-cache-status: DYNAMIC` because no Cache Rule existed for
`/api/v1/index`. The `riotid-index` Cache Rule added on 2026-11-20 now caches
that path (`s-maxage=300`); re-measure the cold path before changing anything
else.

Re-run with:

```bash
CHROMIUM_PATH=/path/to/chrome PERF_URL=https://riotid.teyd.dev/ node apps/web/perf-check.mjs
```

or `mise run perf` after installing Playwright's Chromium.
