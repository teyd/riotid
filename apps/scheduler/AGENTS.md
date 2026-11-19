# Scheduler

Read the root `AGENTS.md` first. This daemon schedules work; it does not own
domain logic.

- Orchestration lives in `src/machine.ts` as an XState v6 statechart. Do not add
  standalone scheduling loops or a second lock. The `waiting` state owns the
  next-wake timer; job states own their invoke and retry policy.
- Scheduling decisions are pure. Read the clock only in Effect code
  (`createEffectLogic`, services, tests). Never in a transition function.
- Spawn `apps/cli` jobs with `--json` and consume the JSON result. Do not import
  `@riotid/ingest`, `@riotid/identity`, or DB write code here.
- Run one job at a time (scan, identity, maintenance, or auth), and never start a
  job while the previous one is still running. The machine's job slot is the
  only authority for this.
- Supervise exactly one API child. If it exits unexpectedly, stop the scheduler
  and exit non-zero so the container restarts both processes.
- Forward `SIGINT`/`SIGTERM` to children, stop accepting work, and wait for them
  to exit before the scheduler exits. `stopChild` owns SIGTERM → SIGKILL.
- Effect v4 only: keep failures typed and do not run effects inside effects.
- Test timing with `TestClock` and job order with the fake service; smoke the
  supervisor with `SCHEDULER_JOBS=false` in `src/main.test.ts`.
