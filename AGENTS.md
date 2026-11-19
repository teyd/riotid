# Project rules

Follow the global agent rules. Project-specific additions:

- Static checks are `effect-tsgo vp check`; never run plain `vp check` in scripts.
- Server code runs from `.ts` on Node 26. Use explicit `.ts` relative imports and no enums.
- Config comes from `.env.schema` (Varlock). Never add `.env.example` or commit secrets.
- Drizzle schema changes go through `drizzle-kit generate` + committed SQL migrations; run `drizzle-kit check` before committing.
- Read the installed Drizzle skills after `drizzle-kit skills`.
- Before using UI SDK, read `node_modules/@ui-sdk/react/docs/llms.txt`; follow the ui-sdk skill.
- Commit after each phase. Do not add an agent coauthor.
