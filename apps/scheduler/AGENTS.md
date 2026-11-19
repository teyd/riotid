# Scheduler

Read the root `AGENTS.md` first. This daemon schedules work; it does not own
domain logic.

- Spawn `apps/cli` jobs with `--json` and consume the JSON result. Do not import
  `@riotid/ingest`, `@riotid/identity`, or DB write code here.
- Run one job at a time (scan or identity pass), and never start a job while the
  previous one is still running.
- Supervise exactly one API child. If it exits unexpectedly, stop the scheduler
  and exit non-zero so the container restarts both processes.
- Forward `SIGINT`/`SIGTERM` to children, stop accepting work, and wait for them
  to exit before the scheduler exits.
- Effect v4 only: keep failures typed and do not run effects inside effects.
- Test schedule calculations as pure functions, and smoke the supervisor with
  `SCHEDULER_JOBS=false` so no Riot work starts.
