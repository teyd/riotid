# Scheduler

Read the root `AGENTS.md` first. This daemon schedules work; it does not own
domain logic.

- Spawn `apps/cli` jobs with `--json` and consume the JSON result. Do not import
  `@riotid/ingest`, `@riotid/identity`, or DB write code here.
- Run one job at a time (scan or identity pass), and never start a job while the
  previous one is still running.
- Supervise the API child process: restart after an unexpected exit with
  backoff, and keep exactly one API instance.
- Forward `SIGINT`/`SIGTERM` to children, stop accepting work, wait for exit,
  then exit non-zero if a child fails to stop.
- Effect v4 only: model jobs as services and layers, keep failures typed, and do
  not run effects inside effects.
- Test spawning and supervision with the fake process utilities in
  `@riotid/test-utils` where possible.
