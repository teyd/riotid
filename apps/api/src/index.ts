// @effect-diagnostics nodeBuiltinImport:off
import { AppConfig } from '@riotid/config'
import { serve } from '@hono/node-server'
import { Effect } from 'effect'

import { makeApp } from './app.ts'

const program = Effect.gen(function* () {
  const config = yield* AppConfig
  const app = makeApp({
    databasePath: config.databasePath,
    indexWindowDays: config.indexRetentionDays,
  })

  serve({ fetch: app.fetch, port: config.port })

  yield* Effect.logInfo(`riotid api listening on http://localhost:${config.port}`)
  yield* Effect.logInfo(`public origin: ${config.publicOrigin}`)
  return yield* Effect.never
})

Effect.runPromise(program).catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`)
  process.exitCode = 1
})
