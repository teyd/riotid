# XState v6 beta assessment

Date: 2026-11-19 · Packages: `xstate@6.0.0-beta.3`, `@xstate/effect@1.0.0-beta.2` ·
Branch: `xstate-scheduler-poc`

## What XState v6 is for

XState models behavior as states, events, and transitions instead of scattered
conditionals and loops. v6 keeps the statechart/actor model but removes the v5
authoring API: transitions are ordinary functions, actions/guards are no longer
created with helpers, schemas replace `types`, and effects are returned as data
through `enq`. The advertised payoff is a smaller API for humans and agents,
stronger inference, pure transitions that can be replayed or run on a durable
host, and tools that inspect machines without executing them.

The problem it addresses here is implicit state: multi-loop job schedulers,
retry/backoff policies, and shutdown paths whose valid states are not written
down anywhere and therefore cannot be enumerated, tested, or inspected.

## Candidate selection

A full pass over the repository ranked three stateful workflows:

1. **Identity resolution pass** (`packages/identity/src/resolve.ts`, 821 lines):
   eight implicit phases, ten progress writes, five budget gates, two pause
   points, six `meta` keys, no pause/failure/resume tests.
2. **Scan run lifecycle** (`packages/ingest/src/scan.ts`): `runs` and
   `run_regions` status columns, a count-based lock, stale-run recovery, no
   failure-path tests.
3. **Scheduler supervisor** (`apps/scheduler/src/main.ts`): four independent
   loops, a semaphore, a `scanRunning` ref, ad-hoc skip/failure delays, process
   supervision, and no orchestration tests.

The identity pass is the biggest source of state, but most of its 821 lines are
matching heuristics and data projection. A statechart would rename its phases
without removing the matching logic. The scan lifecycle is a better fit, but its
interesting behavior (resume after a crash) needs checkpointed crawl results and
a schema change, which is a product decision rather than a library trial.

The scheduler supervisor is the most **state-machine-shaped** problem: it owns
mutual exclusion, cadence, retries, child-process lifetime, and shutdown. It is
also where the current code has no tests. The PoC therefore replaces the four
loops with one XState v6 statechart and leaves the CLI and domain packages
untouched.

## PoC summary

- `apps/scheduler/src/machine.ts` — one machine with 13 states, two parallel
  regions (API supervisor, job slot), and a single active job. Boot order is
  migrate/recover → read last successful scan → auth → scan → identity; then the
  earliest due job wins.
- `apps/scheduler/src/jobs-service.ts` — typed Effect service wrapping the CLI
  runner and converting job results into scheduling outcomes.
- `apps/scheduler/src/main.ts` — 112 lines: config, signal handling, Effect
  layers, and the machine. All loops, the semaphore, and the `scanRunning` ref
  are gone.
- `apps/scheduler/src/jobs.ts` — `stopChild` now sends SIGTERM, waits, escalates
  to SIGKILL after five seconds, and waits for the child to exit. This applies to
  both CLI jobs and the API child.
- Tests: 11 machine tests, 3 child-shutdown tests, 1 supervisor smoke test, plus
  the existing 8 schedule tests. `TestClock` drives all timers.

Behavior changes, all intentional:

- Auth always runs before Riot work. Previously `authLoop` and `scanLoop` raced
  for the semaphore at boot.
- A lock-busy identity pass can no longer be classified as a failure. There is
  no lock to contend for; the job slot serializes work.
- Shutdown waits for the running CLI child and the API child instead of
  SIGTERMing and returning immediately.
- Long waits, retries, and boot failures are explicit states.

## Verification

| Check                                        | Result                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `mise run check` (format, lint, effect-tsgo) | pass                                                                            |
| `pnpm exec vp run -r test`                   | 8/8 packages, 23 scheduler tests pass                                           |
| Machine tests                                | 23 tests in ~0.6 s using `TestClock`                                            |
| `SCHEDULER_JOBS=false` smoke                 | starts, keeps the API supervised, exits 0 on SIGTERM                            |
| Real API supervision                         | health returns `{"ok":true,"service":"riotid-api"}`; SIGTERM stops both, exit 0 |
| API child failure                            | scheduler logs the exit and exits 1                                             |
| `docker build`                               | pass                                                                            |
| Container run                                | API healthy, `docker stop` exits 0, no OOM                                      |
| Runtime deps in image                        | `xstate` and `@xstate/effect` resolve from `apps/scheduler`                     |
| Negative type probe                          | unknown event and missing `STOP` payload are compile errors                     |

`mise run test` itself fails in a worktree because `.env.worktree` sets `PORT`
and `apps/cli/src/main.test.ts` asserts the default port. `pnpm exec vp run -r
test` passes; the failure is unrelated to this branch.

The code-defined machine cannot be loaded by the `xstate` CLI. `machineToJSON`
reports code expressions at `/context`, `invoke.input`, `onDone`, `always`, and
`after`, so `xstate inspect`, `validate`, `simulate`, and `test` work only on a
data-only projection. Running `xstate test` on a hand-written JSON machine does
work and returns `paths`, reachable states, and a proof flag.

## Grades

Grades are for **this use case**, not for XState in general. For 5a, lower is
better because less API surface means fewer choices for an agent.

### 5a. API nuance — 3/10

There is still a lot to choose between when authoring:

- Two packages (`xstate`, `@xstate/effect`) and multiple runtimes (`createActor`,
  `createEffectActor`, `createFSM`, durable host).
- Static transition objects versus transition functions; `enq` methods
  (`raise`, `sendTo`, `spawn`, `emit`, `log`, `cancel`, ...) versus effect
  actions versus invoked logic.
- Named versus inline guards, actions, actors, and delays; state input;
  typestates; choice states; route states; state-level `onError`.
- The `xstate` index alone exports 302 public and 44 experimental symbols.
  `@xstate/effect` adds a dense generic surface for schemas, requirements, and
  actor logic.

The happy path we used is small: `setupEffect`, `createEffectLogic`,
`createEffectActor`, `join`, `waitFor`, `send`. The hard part was discovering
_which_ of those forms applies and how timer events behave. One concrete trap:
`after` emits `{ type: 'xstate.after', delay: 'laneWait' }` — the delay **name**,
not the resolved milliseconds — so computing elapsed time from `event.delay`
silently subtracts zero and reschedules forever. That cost a debugging cycle and
is exactly the kind of choice an agent can get wrong.

### 5b. Type safety — 8/10

Event names and payloads are strongly typed. Sending `{ type: 'SCAN' }` or
`{ type: 'STOP' }` without `signal` fails at compile time, and context updates
are checked. Actor outputs flow into `onDone`, and `RequirementsFrom` propagates
Effect services into `createEffectActor`.

Two caveats:

- Target state names are **not** checked by default. A typo such as
  `target: 'nope'` compiles and fails when the machine is created. Target
  checking appears only after declaring a `states` schema map in `setupEffect`,
  which is extra boilerplate that is easy to omit.
- `@xstate/effect` is typed as experimental and its generic error messages are
  long; most of the PoC's type debugging was in that package.

### 5c. Easy to test — 8/10

This is the strongest part. Transitions are pure, so the machine can be driven
with `TestClock`, fake services, and `waitFor`; no real sleeps, no network, no
database. Eleven machine tests cover boot failure, auth ordering, per-job
cadence, scan interval, budget reset, failure backoff, skipped identity, job
interruption, API exit, and disabled jobs in under a second.

Costs: the interpreter is asynchronous, so tests must wait for snapshots rather
than call transitions directly, and timers need deliberate clock steps. A wake
scheduled after a clock adjustment needs another adjustment; that is Effect's
clock semantics, but it makes the test loop less obvious than a pure reducer.

### 5d. Cyclomatic complexity — 5/10

Measured with `lizard` (production files only):

| Version                                                      | LOC | Functions | Sum CCN | Avg CCN |
| ------------------------------------------------------------ | --: | --------: | ------: | ------: |
| Old `main.ts` + `jobs.ts`                                    | 361 |        39 |     289 |     1.9 |
| New `main.ts` + `machine.ts` + `jobs-service.ts` + `jobs.ts` | 651 |        77 |     405 |     1.5 |

Total cyclomatic complexity rises ~40% and code volume ~80%. No function is over
15 CCN, and the worst old inline loops (CCN 25, 26, 30) are gone, so the code is
flatter and the states are enumerable. But the statechart is not a complexity
reduction; it is a redistribution into many small functions plus a service layer.
An agent asked to change scheduling now needs to understand state topology,
dynamic delays, Effect actors, and the service boundary.

### 5e. Documentation — 7/10

`xstate` ships its docs in the package (65+ Markdown files, versioned, including
`agents.md` and `api-stability.json`). The v6 migration guide, transitions,
parallel states, delays, testing, and durable execution pages are clear, and the
agent guide correctly warns about pure transitions, `enq`, and snapshot
restoration.

Gaps:

- `@xstate/effect` ships only a README. Its links point at `docs/*.md` files that
  are not in the published package; the PoC's timer and action behavior had to be
  read from the bundled types and source.
- The blog's "tools that don't run your code" story does not apply to
  TypeScript-authored machines with functions. Our machine cannot be inspected,
  simulated, or property-tested by the CLI without an evaluator.
- The `xstate docs` command produced no output in this install.

### 5f. Deployment changes — 8/10

No new service, port, volume, environment variable, migration, or runtime
process. The scheduler remains the single container entrypoint and the API is
still its only child. `xstate` is zero-dependency and `@xstate/effect` has only
Effect/XState peers, so the workspace graph is unchanged.

Costs: the image grows by ~7.4 MB (`xstate` 7.2 MB including 844 KB of docs,
`@xstate/effect` 232 KB), and both packages are beta/experimental. A v6 stable
release or a breaking `@xstate/effect` beta will require a deliberate upgrade in
the most critical daemon. Restoring durable execution would additionally require
a host adapter and a persisted-snapshot store.

## Recommendation

**Do not adopt XState v6 for the scheduler now.** The PoC proves the model can
express the behavior and makes it testable, but it increases total complexity and
code volume by ~40–80%, adds two beta dependencies to the process that owns the
write lock, and the v6 tooling cannot inspect the machine as written. The three
real defects it fixed — auth racing Riot work, lock contention misclassified as
a failure, and shutdown not waiting for children — can be fixed directly in the
existing Effect loops in far less code.

Revisit XState when v6 is stable and `@xstate/effect` drops its experimental
label. The first target should be the identity pass lifecycle, where explicit
`paused`, `budgetExhausted`, and `failed` states plus a persisted snapshot would
prevent budget loss and misclassified pauses; that is a real correctness gain,
not a rewrite of already-working supervision. If the scheduler keeps the
statechart, add `states` schemas so target typos fail at compile time, pin both
beta versions exactly, and keep the service layer as the only place that reads
the clock or spawns processes.
