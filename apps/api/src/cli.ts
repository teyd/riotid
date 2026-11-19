#!/usr/bin/env node
import { serve } from '@hono/node-server'
import { Config, Effect } from 'effect'

import { makeApp } from './app.ts'

const AppConfig = Config.all({
  port: Config.Int('PORT').pipe(Config.withDefault(8787)),
  publicOrigin: Config.String('PUBLIC_ORIGIN').pipe(Config.withDefault('http://localhost:5173')),
})

const help = `riotid

Usage:
  riotid serve            Start the API
  riotid status           Print readiness information
  riotid help             Show this help
`

const main = Effect.gen(function* () {
  const command = process.argv[2] ?? 'serve'

  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(help)
    return
  }

  if (command === 'status') {
    yield* Effect.logInfo('riotid api ready')
    return
  }

  if (command !== 'serve') {
    process.stderr.write(`Unknown command: ${command}\n\n${help}`)
    process.exitCode = 2
    return
  }

  const config = yield* AppConfig
  const app = makeApp()

  yield* Effect.logInfo(`riotid api listening on http://localhost:${config.port}`)
  yield* Effect.logInfo(`public origin: ${config.publicOrigin}`)

  serve({ fetch: app.fetch, port: config.port })
})

Effect.runPromise(main).catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`)
  process.exitCode = 1
})
