# Research: web quality gates

Date: 2026-11-20. Scope: E2E tests, performance testing, Strobe health, and
screenshots for the web app. No production code was changed; the only temporary
files were E2E proof specs, and they were removed.

## TL;DR

- **E2E:** none exists. Playwright is already a dependency and is used by Strobe,
  but there is no config, no `e2e/` folder, and no CI job. A mocked-API Playwright
  suite is the right first layer.
- **Performance:** Strobe is the right tool and mostly works. `load` and `scroll`
  pass `--check`; `search` fails its reset check because the sort control is
  unmounted while search is active and gets a new generated id. A stable `id` on
  the trigger fixes it without disabling the check.
- **Strobe health:** browser, Bun, CPU governor, and counters are healthy. The
  missing piece is a stale Playwright browser cache (`chromium-1248` installed,
  `chromium-1255` expected), plus a search-case reset failure and a missing
  status/analytics mock.
- **Screenshots:** no committed visual baselines. Use Playwright failure
  screenshots, Strobe check thumbnails, and Strobe `--pixels` for deliberate
  visual review. Raw screenshots are deterministic here, but baselines are not
  worth the cross-platform maintenance for this app.

## Decisions (2026-11-20)

1. **Screenshots:** failure screenshots plus Strobe pixel comparison only. Do not
   commit Playwright visual baselines.
2. **E2E:** mocked API only. API unit tests cover the backend; no real-stack E2E
   smoke test.
3. **Production performance:** no Umami/RUM. Use deterministic test data:
   `perf/fixture.ts` (35k rows) for Strobe and E2E; `db:seed:scale` when the API
   read path needs a real database. Delete `apps/web/perf-check.mjs` and the
   `perf` task. Keep Strobe for lab A/B and `perf:compare` for local verdicts.

## Why no RUM

Real-user monitoring would report Core Web Vitals from actual visitors, but it
adds an analytics dependency, a noisy signal that cannot attribute a regression
to a commit, and a dashboard nobody asked to maintain. This project answers the
same questions with deterministic test data instead. No field analytics are part
of this plan.

## Test-data strategy

- **Client lab:** `perf/fixture.ts` generates 35,000 deterministic players. Strobe
  runs load, scroll, and search against the built SPA with no database or network.
- **E2E:** the same fixture mocks the API; assertions are behavioral, not
  performance.
- **API scale:** `mise run db:seed:scale` creates 500k players and 1M intervals
  when a read-path decision needs a real SQLite file. This is manual, not CI.
- **Production:** no synthetic performance script. A deploy smoke, if wanted, is
  a health check, not a benchmark.

## Current state

| Gate             | Command                 | Status                                                                                                                     |
| ---------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Static checks    | `mise run check`        | Passes; `effect-tsgo vp check` + `tsc`                                                                                     |
| Unit tests       | `mise run test`         | 16 files, 98 tests, 8/8 workspaces pass                                                                                    |
| Web build        | `mise run build`        | Passes; `apps/web/dist` is 876 KB                                                                                          |
| Strobe check     | `mise run perf:web`     | 2/3 cases pass; `search` fails `ResetIncomplete`                                                                           |
| Strobe A/B       | `mise run perf:compare` | Not re-run here; check mode proves the build/serve/browser path                                                            |
| Production check | `mise run perf`         | Fails by default (browser missing); works with `CHROMIUM_PATH`, but `searchMs` is `-1`. Delete; no production perf script. |
| E2E              | —                       | No config, no tests, no CI job                                                                                             |
| Screenshots      | —                       | No committed baselines; failure screenshots + Strobe pixels are the plan                                                   |

The web tests cover `lib/*.ts` only: analytics, API helpers, clipboard, history,
rate limiting. There are no `.test.tsx` files. `vite.config.ts` includes only
`apps/**/*.test.ts` and `packages/**/*.test.ts`, and there is no DOM test
environment, so component tests are not set up either.

`.gitignore` already ignores `test-results/` and `playwright-report/`, so the
repo anticipated Playwright artifacts but never added the runner config.

## 1. E2E

### Options

| Option                                      | Fit                                                                                                                                  | Cost                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Playwright with mocked API                  | **Recommended.** Tests the built SPA, routing, queries, virtualization, keyboard, focus, and responsive behavior without a database. | Low: dependency and browser already present; ~5 s test run.                     |
| Playwright against real API + seeded SQLite | Catches proxy/build/DB integration.                                                                                                  | Higher: seed, migrate, API process, ports, cleanup; slower and more brittle.    |
| Vitest browser / component tests            | Good for isolated components.                                                                                                        | New browser provider and DOM setup; duplicates E2E coverage for this small app. |

The app's logic already has unit tests. Its risk is in the browser integration:
query params, virtualizer, keyboard navigation, selection, resize, and responsive
switching. That is exactly E2E territory. The API contract is covered by
`apps/api/src/app.test.ts`; the fixture is type-checked against
`@riotid/contracts`.

A real-stack smoke test is not part of this plan. It would be one test, not the
main suite, and it adds a database, API process, and port lifecycle to CI. The
mocked suite plus `apps/api/src/app.test.ts` covers the contract; revisit only if
a proxy/build/DB bug escapes both.

### Recommended structure

```
playwright.config.ts          # root, one config
e2e/
  support.ts                  # fixed clock, API mocks, external blocking
  web.spec.ts                 # 3–4 long flow tests
perf/
  app.bench.ts                # unchanged except mocks/reset
  fixture.ts                  # shared deterministic data
```

Why root: `perf/`, `strobe.json`, and `tools/` already live at the repo root, and
`@playwright/test` is a root dependency. Keeping E2E next to the perf harness
makes the shared fixture obvious. If E2E later belongs to the web app only, move
both under `apps/web`; do not split the fixture.

Changes required for this layout:

- Add `e2e/**/*.ts` to the root `tsconfig.json` include list. Today it covers
  `apps`, `packages`, `perf`, `tools`, and root `*.ts`, but not `e2e`.
- Check the lint environment in `vite.config.ts`. Its overrides cover
  `apps/web/**` as browser and `apps/api`, `apps/cli`, `apps/scheduler`,
  `packages`, `tools` as node. `e2e/**` currently falls through; add it to the
  node group (Playwright specs run in Node) or the browser group if lint wants
  DOM globals for `page.evaluate` callbacks.
- Use `.spec.ts`, not `.test.ts`. `vp test` only picks `.test.ts`; keeping the
  names separate prevents the unit runner from trying to execute Playwright.

### Config sketch

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 4173)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vp build apps/web && pnpm --dir apps/web exec vp preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { _VARLOCK_ALLOW_EMPTY_CONFIG: '1' },
  },
})
```

`reuseExistingServer: false` is deliberate: reusing a preview can serve a stale
`dist` after a code change. A rebuild is only a few seconds. In worktrees, set
`E2E_PORT` to a unique value; two worktrees must not share `4173`.

### Fixture sketch

```ts
// e2e/support.ts
import { test as base, expect } from '@playwright/test'
import { playerDetail, playerPage, playerSearch, siteOverview } from '../perf/fixture.ts'

export const NOW = Date.UTC(2026, 10, 19, 12)
const PIXEL = Buffer.from('iVBORw0KGgo…', 'base64')

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(NOW) // Date only; timers keep running
    const origin = new URL(test.info().project.use.baseURL!).origin

    // Later routes win; keep the catch-all first.
    await page.route('**/*', (route) =>
      route.request().url().startsWith(origin) ? route.continue() : route.abort(),
    )
    await page.route(`${origin}/api/v1/status`, (route) =>
      route.fulfill({
        json: { auth: { updatedAt: NOW - 3_600_000, staleAfterMs: 5_400_000 } },
      }),
    )
    await page.route(`${origin}/api/v1/overview`, (route) =>
      route.fulfill({ json: siteOverview() }),
    )
    await page.route(`${origin}/api/v1/players?*`, (route) => route.fulfill({ json: playerPage() }))
    await page.route(`${origin}/api/v1/search?*`, (route) =>
      route.fulfill({ json: playerSearch() }),
    )
    await page.route(`${origin}/api/v1/players/*`, (route) =>
      route.fulfill({ json: playerDetail(route.request().url().split('/').pop() ?? '') }),
    )
    await page.route('https://media.valorant-api.com/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: PIXEL }),
    )

    await use(page)
  },
})

export { expect }
```

`page.clock.setFixedTime` is important: `perf/fixture.ts` uses a fixed `NOW`, but
the UI formats relative times against the real clock. Without it, labels such as
“8d ago” drift and screenshots change daily.

The catch-all also blocks the Umami analytics script in `index.html`. Without
it, every test makes a real external request.

Register a low-priority `${origin}/api/**` fallback that returns `500` (or a
JSON “unmocked API request” error) before the specific API routes. Then a new
endpoint fails loudly instead of reaching a local API through the preview proxy.

### Test scope

Prefer 3–4 long tests with many assertions over many tiny tests, consistent with
the repo's test style.

1. **Directory flow (desktop).**
   - Load, wait for first row and detail.
   - Assert virtualizer renders far fewer nodes than rows: `document.getElementsByTagName('*').length < 1000`
     and rendered `[data-player-row]` count `< 40`. This guards the historical
     523k-node regression from `docs/perf-report.md`.
   - `j`/`k`/`Home`/`End` change `[data-selected="true"]`.
   - `/` focuses search; `Escape` clears then blurs.
   - Type 2 characters: “Keep typing…”. Type 3: search results appear.
   - Clear search; the sort control is still usable.
   - Region filter sends `region=eu` and updates the list.
   - Scroll to the bottom; next page loads (requires a cursor-capable fixture).
2. **Detail flow.**
   - Deep link `/puuid/<id>` opens the row and detail.
   - Name, region, and ban timelines render; counters match.
   - Copy link uses the clipboard and the absolute player URL.
   - Back returns to the list and restores focus.
3. **Mobile.**
   - At 390×844, the list is full width; selecting a row shows detail; “Back to
     player list” returns. This passed in the proof run.
4. **Errors and empty states.**
   - Overview 500: “Could not load the overview.” + retry.
   - Browse 500: “Could not load players.” + retry.
   - 429: “API rate limited (429) — retrying”.
   - Empty browse: “No players yet.”; empty public overview: “No public players
     yet.”.

Use role-based locators where the accessible name is stable: `getByRole('textbox', { name: 'Search current and past names' })`,
`getByRole('button', { name: 'Back to player list' })`. Use
`[data-player-row]` for virtualized rows and the scroll container; those are
stable test hooks already in the source.

### Proof run

A temporary spec with the fixture above passed both desktop and mobile tests in
3.2 s. It loaded 35,000 mocked rows, waited for the detail, searched, selected,
and captured screenshots. Running it twice produced byte-identical PNGs:

```
riotid-list.png          84 KB
riotid-mobile.png        61 KB
riotid-mobile-detail.png 42 KB
riotid-search.png       109 KB
```

The proof used Chromium 1248 via `launchOptions.executablePath` because the
matching 1255 build is not installed. A committed E2E setup should install the
matching browser instead.

### Fixture gaps

`perf/fixture.ts` is a good start but not enough for E2E:

- No `serviceStatus()`; `/api/v1/status` is not mocked, so local bench runs may
  hit a real API through the preview proxy and CI runs error.
- `playerPage()` always returns the first page with `nextCursor: null`; load-more
  cannot be tested.
- `playerPage()` ignores `sort` and `region`; filter tests would only assert the
  request URL, not the result.
- `playerSearch()` always returns `query: 'player 0'`; it should echo the query.
- `playerDetail()` returns empty `names`, `regions`, `bans`, and `links`; the
  timeline and evidence UI are never exercised.

Extend the fixture with optional parameters and one rich player. Keep the
defaults unchanged so the Strobe bench still gets the same 35,000-row page.

## 2. Performance testing

### What works

`strobe status --fast` is healthy on this machine: performance governor, 6% CPU
load, Playwright Chromium found, Bun 1.4.4. `mise run perf:web` builds the app,
serves it, and runs the three cases. In a single check run:

| Case     | Primary        | Value        | Also            |
| -------- | -------------- | ------------ | --------------- |
| `load`   | `launch.ready` | 221 ms       | —               |
| `scroll` | `main.work`    | 129 ms       | `dom.nodes` 518 |
| `search` | `main.work`    | 38.3–40.2 ms | `dom.nodes` 391 |

These are cold check values, not a verdict. They include first-run work such as
shader compiles.

### What is broken

1. **Search fails `ResetIncomplete`.** The search run types into the filter,
   which replaces the sort `Select` with the text “relevance”. Clearing the
   filter mounts a new `Select`, and its generated id changes from
   `_r_b_` to `_r_i_`. Strobe sees a different control and refuses run 2.
2. **Default `mise run perf` fails.** `@playwright/test` 1.65.1 expects
   `chromium_headless_shell-1255`; the cache has `chromium-1248`. The script has
   no fallback, unlike `tools/strobe-browser.sh`.
3. **The production check's search metric is stale.** It looks for
   `input[placeholder^="Search players"]`; the current placeholder is “Search
   current or past names…”. Result: `searchMs: -1`.
4. **The production check still reports an `index` metric.** The SPA no longer
   requests `/api/v1/index`; the field is always `null`.
5. **The bench has no status mock.** `/api/v1/status` is not intercepted. Locally
   the preview proxy can forward it to a running API on `:8787`; in CI it errors.
   Either way the run is not hermetic, and the footer state depends on the
   machine.
6. **The bench does not block Umami.** The analytics script is an external
   request on every launch. It did not break the check here, but it adds network
   variance and an external dependency.

### Fixes, in order

1. Add a stable id to the sort trigger:

   ```tsx
   <SelectTrigger
     id="player-sort"
     aria-label={`Sort players: ${sortOption?.label ?? sort}`}
   ```

   This was tested: the search case then passes `--check` with the reset check
   still on. Prefer this over `resetCheck: false`; it fixes the DOM instability
   and keeps the check that caught it.

2. Add mocks to `perf/app.bench.ts`:

   ```ts
   await ctx.mock(`${origin}/api/v1/status`, () => ({
     body: { auth: { updatedAt: NOW - 3_600_000, staleAfterMs: 5_400_000 } },
   }))
   await ctx.mock('https://umami.teyd.dev/*', () => ({
     headers: { 'content-type': 'application/javascript' },
     body: '',
   }))
   ```

3. Delete `apps/web/perf-check.mjs` and its `perf` task. The deterministic
   fixture covers performance; a production copy only duplicates Strobe from one
   machine. If it must stay temporarily, fix the search selector, drop the dead
   `index` block, and document `pnpm exec playwright install chromium` or support
   the same browser fallback as `tools/strobe-browser.sh`.

4. Rename the remaining task for clarity:
   - `perf:check` — Strobe `--check` (currently `perf:web`)
   - `perf:compare` — timed local A/B

   Update `README.md`, `docs/benchmarks.md`, and `docs/perf-report.md` after the
   rename. Do not keep aliases.

### CI vs local

- **CI (shared runner):** timing is refused. Run `strobe bench --check` only, or
  the Strobe GitHub Action in `check` mode. It proves the bench still runs and
  catches broken selectors. Exact counters (`dom.nodes`, `net.requests`) can be
  held with `--noworse` after a base run. Do not run `perf:compare` on a
  GitHub-hosted runner.
- **Local / dedicated machine:** `mise run perf:compare` for verdicts. Run
  `strobe status --calibrate` once; the current check warns
  `StaleCalibration`.
- **Strobe Action:** pin `anomalyco/strobe@v0.44.0`, set `version: project`,
  `bench: perf/app.bench.ts`, `upload-artifacts: on-failure`. Run
  `pnpm install --frozen-lockfile` before it so the project binary resolves.
  Add `noworse` only after a base-vs-head run is stable; start with selector
  checks.
- **Production:** no synthetic performance script and no RUM. The lab fixture is
  the performance source of truth. A deploy smoke, if wanted, is a health check,
  not a benchmark; it does not gate a PR.

### CI time and cost

Before the CI efficiency pass, `analyze` took 21–25 s, `test` 43 s, `build`
23–27 s, `db` 21–37 s, and `docker` 61–151 s. Wall time was 60–90 s, or about
2.5 min when Docker was slow.

The pass folded `build` and `db` into `analyze` and stopped exporting Docker cache
from pull requests. Two PR runs, 44699982462 and 44700448675, measured:

| Job            |    Time |
| -------------- | ------: |
| `analyze`      | 33–38 s |
| `test`         | 44–48 s |
| `docker`       | 15–21 s |
| **Wall clock** | 47–52 s |

These are warm-cache runs; the Docker drop from 61 s to 15–21 s is partly cache
warmth, so the structural saving is the two removed setup jobs. See
[the CI efficiency audit](ci-efficiency.md) for the full before/after.

Recommendation for the new tests:

- **E2E:** add it to `analyze` after the web build, serve the existing `dist`,
  and use the runner's Google Chrome (`channel: 'chrome'`). It should add 5–10 s,
  keeping PR wall clock around 50–60 s. Do not create a new job.
- **Strobe `--check`:** run on pushes to `main` or weekly, not on PRs. It takes
  about 45 s and would become the new critical path.
- **Timed A/B:** local only.
- **No path-gating yet:** a skipped required check can block a PR. Revisit only
  if Docker becomes non-required.

### Cases worth adding

- **Detail open:** click a row, wait for the detail heading, `main.work` plus
  `dom.nodes`. This covers the lazy detail chunk.
- **Load more:** scroll to the bottom, wait for the next page, `main.work` plus
  `dom.nodes`. Requires the cursor-capable fixture.
- **Filter:** click `EU`, wait for new rows, `main.work`. Requires a
  query-aware fixture.

Do not add cases without a decision they inform. Three cases is already enough
to catch the historical “render everything” failure.

### API load testing

`docs/load-report.md` is historical and has no committed harness. The API target
(p95 < 150 ms) was met, and the report explicitly says not to add detail caching
until a VPS measurement says otherwise. Do not build an API load harness now.
If a decision needs one later, use a `command()` Strobe target or a short
`oha`/`autocannon` run against a throwaway server with raised rate limits. A
Bun-based Strobe `script()` target may not match the Node SQLite runtime; prefer
a real Node process.

## 3. Screenshots

There are three different jobs; do not conflate them.

| Need                            | Tool                                                   | When                           |
| ------------------------------- | ------------------------------------------------------ | ------------------------------ |
| Debug a failed E2E              | Playwright `screenshot: 'only-on-failure'` + trace     | Every CI run                   |
| Debug a failed bench            | Strobe check thumbnails and action failure screenshots | Strobe check                   |
| Review an intentional UI change | Strobe `page.snapshot()` + `--pixels`                  | Before merging a visual change |
| Prevent an accidental UI change | Not used; no committed baselines                       | —                              |

### Strobe pixels

Strobe supports `page.snapshot(name)` and `bench --pixels`. It captures the same
state in base and head and reports whether the pixels match. There are no
committed baselines, so it is ideal for “did this change the UI?” on a local or
dedicated machine. It is not a CI gate via the GitHub Action (the action has no
pixel input), and snapshots must be time-stable. Add `ctx.addInitScript` to fix
`Date` before using it, or relative labels will differ between runs.

### Playwright baselines (not chosen)

The proof run showed that raw screenshots are deterministic when:

- the API is mocked and card art is a fixed pixel;
- `page.clock.setFixedTime` fixes relative dates;
- `document.fonts.ready` is awaited;
- `reducedMotion: 'reduce'` and `animations: 'disabled'` are set;
- locale, timezone, viewport, and device scale are fixed;
- the detail chunk is awaited before capture.

Two consecutive runs produced identical SHA-256 hashes for all four screenshots.
Baselines are therefore feasible. They are not worth it here: they are
platform-sensitive, need a pinned Linux container, add ~190 KB of PNGs, and
require a deliberate update step whenever the UI changes. Keep the determinism
work anyway; it makes failure screenshots and Strobe pixel captures reliable.

If that trade-off changes, the minimum policy is: Linux-only, pinned Playwright
container, `maxDiffPixelRatio` around 0.002–0.01, and three states (desktop list

- detail, mobile list, mobile detail). Do not start with search; the sort control
  swap is a moving part.

## 4. Code structure changes

### Do now

- Add `id="player-sort"` to the sort trigger.
- Add status and Umami mocks to the bench; add `serviceStatus()` to the fixture.
- Add the Playwright config, `e2e/support.ts`, and one `e2e/web.spec.ts`.
- Extend the fixture with query-aware pages, a next cursor, and one rich detail.
- Add `e2e/**/*.ts` to `tsconfig.json`.
- Add `test:e2e` scripts and a `mise run e2e` task.
- Add an E2E CI job and a Strobe check job.
- Delete `apps/web/perf-check.mjs` and the `perf` task; do not add RUM.

### Later, only if needed

- Split `players-page.tsx` (737 lines) into a data hook and two panels. This
  would make component tests possible, but E2E covers the integration and the
  existing lib tests cover the pure logic. Do not refactor for testability alone.
- Add a real-stack smoke test only if a proxy/build/DB bug escapes the mocked
  suite. It is not part of the default plan.
- Revisit visual baselines only if UI regressions become frequent enough to
  justify the pinned-container maintenance.

### Do not

- Do not add RUM, Umami performance, or another field-analytics dependency. The
  deterministic fixture is the performance source of truth.
- Do not add Cypress, Storybook, Percy, Chromatic, or Argos. Playwright and
  Strobe already cover the needs; a SaaS visual service is overkill for one
  read-only SPA.
- Do not add jsdom/happy-dom and Testing Library just to render `PlayersPage`.
  The page's risk is integration, not isolated rendering.
- Do not run timed Strobe comparisons on GitHub-hosted runners.
- Do not make E2E depend on the production site or real card art.
- Do not commit Playwright visual baselines in this plan.

## 5. Suggested rollout

**P0 — repair the existing gates (small, no new layer).**

1. Stable sort-trigger id.
2. Bench status/Umami mocks.
3. Delete the production perf script and task; keep performance on test data.
4. Install matching Playwright Chromium.
5. Verify `mise run perf:web` exits 0.

**P1 — add E2E.**

6. Config + support fixture + long desktop/mobile tests.
7. Fixture extensions.
8. `mise run e2e` and docs.
9. CI job with report/trace artifacts.

**P2 — add the performance gate.**

10. Add `strobe --check` to the same web CI job, not a separate job.
11. Optional `noworse` counters after a stable base run.

**P3 — no visual baseline project.**

12. Use failure screenshots and Strobe `--pixels` for visual review.
13. Keep the determinism fixtures (clock, fonts, network) so those screenshots
    stay useful.

## Sources

- Playwright visual comparisons: https://playwright.dev/docs/test-snapshots
- Playwright best practices: https://playwright.dev/docs/best-practices
- Strobe README and GitHub Action:
  `node_modules/@hona/strobe/README.md` and
  https://github.com/anomalyco/strobe

## Evidence

```text
mise run test
  16 test files, 98 tests, 8/8 workspaces successful

mise run perf:web
  pass load   launch.ready 221 ms
  pass scroll main.work 129 ms · dom.nodes 518
  FAIL search ResetIncomplete: #ui-sdk-_r_i_-trigger vs #ui-sdk-_r_b_-trigger

strobe bench perf/app.bench.ts --head . --check --headless --filter search
  (with id="player-sort") pass search main.work 38.3 ms · dom.nodes 391

CHROMIUM_PATH=…/chromium-1248/… node apps/web/perf-check.mjs
  ready 1201 ms · LCP 320 ms · CLS 0.0018 · nodes 430 · rows 21 · searchMs -1

Playwright proof (temporary, removed)
  2 tests passed in 3.2 s
  4 screenshots, byte-identical across two runs
```
