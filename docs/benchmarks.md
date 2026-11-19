# Benchmarks

[strobe](https://github.com/anomalyco/strobe) measures the client path as an A/B:
it builds two revisions, serves each, and runs alternating pairs in fresh browser
launches. Use it to support a claim that a change made the list faster, cheaper,
or lighter. The [performance report](perf-report.md) keeps the production
measurements; `mise run perf` still checks the deployed site once.

## Commands

```bash
mise run perf:web      # each case once: proves the bench runs, no verdict
mise run perf:compare  # timed: main against the working tree
```

Both run headless, so they measure CPU work and counters, not frames or input
latency. Run one case, or choose more pairs, with strobe directly:

```bash
pnpm exec strobe bench perf/app.bench.ts --base main --head . --headless --filter scroll
pnpm exec strobe bench perf/app.bench.ts --base main --head . --headless --pairs 20
```

A base revision gets its own worktree, `pnpm install`, and web build; the first
comparison is slower than later ones.

## What it measures

| Case     | Action                           | Primary        | Also reads  |
| -------- | -------------------------------- | -------------- | ----------- |
| `load`   | Cold launch until the first row  | `launch.ready` | —           |
| `scroll` | 8,000 px through the virtualizer | `main.work`    | `dom.nodes` |
| `search` | Type `player 0` into the filter  | `main.work`    | `dom.nodes` |

`perf/fixture.ts` mocks `/api/v1/index`, player details, and card art with 35,000
deterministic rows. The bench needs no database, API server, or network. A
DOM-node regression such as rendering the whole list shows in `dom.nodes` even
when the time verdict is noisy.

## Reading a result

A comparison prints a verdict such as `same (±2%)`, `faster`, or `slower`, with
its paired interval. `unclear` and `underpowered` do not mean "no change": the
output names a re-run with more pairs. Drill into the evidence:

```bash
strobe query <exp_…> insights
strobe report experiment <exp_…> --open
```

`strobe bench` exits 0 when head is slower; read `series[].primary.verdict_kind`
in `--json` or add `--require-verdict` in scripts. Shared CI runners refuse timed
runs, so keep timing local or on a dedicated machine; `--check` and counter
comparisons work in CI.

## Chromium sandbox

`tools/strobe-browser.sh` points strobe at Playwright's Chromium. It adds
`--no-sandbox` only when the system blocks unprivileged user namespaces, which
Chromium's sandbox requires; set `STROBE_CHROME` to use another browser binary.
