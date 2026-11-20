# Frontend dependencies

Research date: 2026-11-20. Versions are the installed ones unless noted.

## Installed

- React 19.3.1, Vite+ 1.7, Tailwind 4.
- `@tanstack/react-router` 1.170.46 + `@tanstack/router-plugin` 1.169.0.
- `@tanstack/react-query` 5.108.0 (latest patch 5.108.1).
- `@tanstack/react-virtual` 3.14.26.
- `@ui-sdk/core` and `@ui-sdk/react` beta.10 for accessible behaviors.
- No Zustand, TanStack Store, TanStack DB, Pacer, Hotkeys, or Charts.

Current web production bundle: 566.5 kB minified, 185.5 kB gzip.

## TanStack verdicts

| Library              | Verdict        | Why                                                                  |
| -------------------- | -------------- | -------------------------------------------------------------------- |
| Router               | Keep           | File routes and typed links; move `q`/region/sort into search params |
| Query                | Keep           | Server-state cache and `useInfiniteQuery` already fit the cursor API |
| Virtual              | Keep           | Variable-height sections, keyboard navigation, 250-row pages         |
| DB                   | Skip           | 1.0 RC; normalized client store + optimistic writes for synced apps  |
| Store                | Skip           | No cross-route client state that URL + Query do not already cover    |
| Charts               | Evaluate later | No charts today; compare bundle and API when a chart is proposed     |
| Pacer                | Skip           | Beta; the search debounce is eight lines and needs no queue          |
| Hotkeys              | Skip           | Beta; `/`, `j`, `k`, arrows are coupled to list selection already    |
| Table / Form / Start | Skip           | No table state, forms, or SSR/server-rendering requirement           |

### TanStack DB

`@tanstack/db` is a reactive client store: collections, live queries, and
optimistic writes. It is useful when one entity appears on several screens and
users mutate it. This app is public, read-only, one master-detail screen, and
ships only cursor-paged slices of 500k players. Loading a collection would undo
that pagination. The package is also still `1.0.0-rc.1.5`. Revisit only for an
operator UI with writes and cross-screen joins.

### TanStack Store / Effect Atom

`@tanstack/store` and `@effect/atom-react` both solve shared client state. Our
only shared UI state is search, region, and sort, which belongs in the URL.
Effect Atom additionally puts the Effect runtime in the browser bundle. Skip
both unless we get a real multi-route client store.

### TanStack Pacer / Hotkeys / Charts

- Pacer and Hotkeys are still beta (`0.24` / `0.27` recommended React packages).
  Their features are real, but the current code does not justify another
  dependency.
- Charts is pre-1.0 in practice and has no current product use. If we add
  change-frequency charts, compare TanStack Charts with uPlot (dense timelines)
  and Chart.js (simple charts) before choosing.

## Alternatives checked

- Virtualization: TanStack Virtual is already small (64 kB unpacked) and does
  what the list needs. `virtua` is a credible alternative with a larger
  unpacked package, but migration would not remove a bottleneck.
- Charts: uPlot for large time series; Chart.js or Recharts for simple charts;
  TanStack Charts only if its grammar and accessibility defaults win a real
  prototype.
- Hotkeys: `tinykeys` is smaller than TanStack Hotkeys, but the existing handler
  is already correct for the list.
- Debounce: a small hook beats pulling Pacer for one search input.
- State: URL search params + TanStack Query; no client store.

## Actions

1. Update `router-plugin` when a 1.170 plugin ships, and take the Query 5.108.1
   patch.
2. Move `q`/region/sort into Router search params; remove the module-level
   persistence in `players-page.tsx`.
3. Do not add TanStack DB, Store, Pacer, Hotkeys, or Charts without a concrete
   feature that needs them.
