# Database

Read the root `AGENTS.md` first. This package owns the SQLite schema, clients,
migrations, seed, and maintenance.

- Change `src/schema.ts`, then run `mise run db:generate`. Commit the generated
  SQL and `snapshot.json`; run `mise run db:verify` before committing.
- Never hand-edit a snapshot or an applied migration. Add a new migration.
- Use `readDatabase()` in the API and `writeDatabase()` in the CLI and scheduler.
  The API must never hold a writable connection.
- Keep the single-writer assumption. The client enables WAL and foreign keys;
  do not open a second writer in a process that already has one.
- Tests create temporary databases; run `pnpm --dir packages/db test`.
