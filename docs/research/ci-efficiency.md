# CI efficiency audit

Date: 2026-11-20. Scope: `.github/workflows/ci.yml`. Tool: the
`github-actions-efficiency` skill. Branch: `ci/efficiency`, PR #2.

## Waste sources

1. **Four jobs paid the same setup tax.** `analyze`, `test`, `build`, and `db`
   each ran `setup-vp`, restored the 271 MB dependency cache, and installed
   dependencies. Their actual work was small:

   | Job       | Setup | Work |
   | --------- | ----: | ---: |
   | `analyze` |  10 s |  6 s |
   | `test`    |  17 s | 20 s |
   | `build`   |  18 s |  3 s |
   | `db`      |  15 s |  0 s |

   That is about 60 s of setup across four jobs for 29 s of work.

2. **Docker exported its cache from every pull request.** `cache-to:
   type=gha,mode=max` ran on PRs as well as `main`. PR cache scopes are not
   reused by `main`, so the export mostly cost time and storage. The Docker job
   was also the slowest job (61–151 s) on several runs.

3. **No concurrency or matrix waste.** `concurrency` already cancels stale runs
   on the same ref, and there is no matrix. No change was needed.

## Changes

- Folded the web build and the Drizzle check into `analyze`. Removed the `build`
  and `db` jobs. The job still runs every check; it just pays setup once.
- Kept `test` as its own job so test failures still report in parallel with
  static checks.
- Docker: `cache-from` stays on every run; `cache-to` now runs only on pushes to
  `main`. Added `provenance: false` because this CI job does not push an image.
- No trigger or matrix changes. Required checks keep their names (`analyze`,
  `test`, `docker`).

## Validation

Two post-change runs on PR #2:

| Job            | Run 44699982462 | Run 44700448675 |
| -------------- | --------------: | --------------: |
| `analyze`      |            38 s |            33 s |
| `test`         |            44 s |            48 s |
| `docker`       |            15 s |            21 s |
| **Wall clock** |        **47 s** |        **52 s** |

The Docker build step itself was 2 s in the first run because every layer was
cached. The PR runs passed no `cache-to` flag; they only read the GHA cache.
`provenance: false` is visible in the build command.

Baselines from `main` before the change:

| Run                                                                    |  Wall | analyze | test | build |   db | docker |
| ---------------------------------------------------------------------- | ----: | ------: | ---: | ----: | ---: | -----: |
| [44697494564](https://github.com/teyd/riotid/actions/runs/44697494564) |  63 s |    21 s | 43 s |  27 s | 21 s |   61 s |
| [44680874607](https://github.com/teyd/riotid/actions/runs/44680874607) | 154 s |    25 s | 43 s |  23 s | 37 s |  151 s |

Concurrency was not changed, so no cancellation test was run. There is no path
gating, so no skip test was run.

## Impact

Two measured post-change runs, warm cache:

- Total runner time: 173 s → 97–102 s on the fast-cache baseline (about −41% to
  −44%).
- PR wall clock: 63 s → 47–52 s (about −11 to −16 s).
- Slow-Docker runs should keep roughly the same wall clock but lose about 40 s
  of runner time from the two removed setup jobs.

These are two warm-cache PR runs, not a statistical sample. The Docker jump from
61 s to 15–21 s is partly cache warmth, so do not attribute all of it to the
workflow change. The setup-job removal is structural and repeats on every run.

## Recommendation

1. **Add E2E to `analyze`, not a new job.** The build is already there; a preview
   server can serve that `dist`. With the runner's Chrome and no browser
   download, the suite should add 5–10 s. Expected PR wall clock: 50–55 s,
   inside the skill's 1.25× guardrail.
2. **Run Strobe `--check` on `main` only** (or weekly/manual), not on PRs. It
   takes about 45 s and would otherwise become the new critical path. Timed A/B
   stays local.
3. **Keep `test` separate.** It is the longest job at 44 s; merging it would save
   one setup but hide test failures behind static-check failures.
4. **Upgrade the Node 20 actions in a separate PR.** The run reports
   `actions/checkout@v4`, `docker/setup-buildx-action@v3`, and
   `docker/build-push-action@v6` as Node 20 actions forced onto Node 24. Current
   releases are `actions/checkout@v7`, `docker/setup-buildx-action@v4`, and
   `docker/build-push-action@v7`. This is maintenance, not a speed win; test it
   on a branch.
5. **Do not path-gate the whole workflow.** A skipped required check can block a
   PR. If Docker should skip docs-only changes later, use a changed-files job and
   make sure Docker is not a required check.
