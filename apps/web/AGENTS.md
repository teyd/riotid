# Web

Read the root `AGENTS.md` first; follow the `ui-sdk` skill for component work.

- Read `apps/web/node_modules/@ui-sdk/react/docs/llms.txt` before using UI SDK
  components.
- `src/styles.css` must start with `@layer ui-sdk;` before `@import 'tailwindcss'`.
  Do not reorder those lines or add a second entry stylesheet.
- Prefer UI SDK components and native elements to hand-rolled ARIA. Do not add
  `role` or `aria-*` to compensate for a non-semantic control; fix the markup.
- Text must meet WCAG AA contrast against the dark theme (4.5:1 body, 3:1
  large). Use `@theme` tokens instead of arbitrary colors.
- React Compiler is enabled: write plain components and do not add `useMemo`,
  `useCallback`, or `memo` without a measured reason.
- Type API data with `@riotid/contracts` and fetch through `lib/api.ts` and
  TanStack Query. `routeTree.gen.ts` is generated; never edit it by hand.
- Keep CSS in `src/styles.css` and Tailwind utilities; total CSS stays under the
  project's 2K LOC budget.
- Test behavior with `pnpm --dir apps/web test`; cover keyboard, focus, empty,
  and error states when a flow changes.
