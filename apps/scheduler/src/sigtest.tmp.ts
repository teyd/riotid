import { Deferred, Effect } from 'effect'

const shutdown = Deferred.makeUnsafe<void>()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    process.stderr.write(`caught ${signal}\n`)
    Deferred.doneUnsafe(shutdown, Effect.void)
  })
}

const main = Effect.gen(function* () {
  yield* Effect.logInfo('waiting')
  yield* Deferred.await(shutdown)
  yield* Effect.logInfo('shutting down')
})

Effect.runPromise(main).then(
  () => process.stderr.write('exited clean\n'),
  (error) => {
    process.stderr.write(`failed ${String(error)}\n`)
    process.exitCode = 1
  },
)
