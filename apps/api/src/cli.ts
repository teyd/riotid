#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalDateInEffect:off
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import * as NodeHttpClient from '@effect/platform-node/NodeHttpClient'
import { serve } from '@hono/node-server'
import {
  loadCookieFile,
  parseCookieInput,
  qrLogin,
  reauth,
  refreshSession,
  RiotAuthError,
  saveCookieFile,
  type AuthSession,
} from '@riotid/riot'
import { Config, Effect } from 'effect'

import { makeApp } from './app.ts'
import { runProbe } from './probe.ts'

const require = createRequire(import.meta.url)
const qrcode = require('qrcode-terminal') as {
  generate: (input: string, options: { small: boolean }, callback: (code: string) => void) => void
}

const AppConfig = Config.all({
  port: Config.Int('PORT').pipe(Config.withDefault(8787)),
  publicOrigin: Config.String('PUBLIC_ORIGIN').pipe(Config.withDefault('http://localhost:5173')),
  cookieFile: Config.String('COOKIE_FILE').pipe(Config.withDefault('./data/cookies.json')),
  countryCode: Config.String('RIOT_COUNTRY_CODE').pipe(Config.withDefault('US')),
  qrTimeoutSeconds: Config.Int('RIOT_QR_TIMEOUT_SECONDS').pipe(Config.withDefault(300)),
  authKeepaliveHours: Config.Int('AUTH_KEEPALIVE_HOURS').pipe(Config.withDefault(6)),
})

const help = `riotid

Usage:
  riotid serve                 Start the API
  riotid status                Show readiness and auth state
  riotid auth:login            Sign in with a Riot Mobile QR code
  riotid auth:save [file]      Import a pasted cookie jar (or read stdin)
  riotid auth:check            Verify the stored cookie jar
  riotid auth:refresh          Refresh tokens and persist the cookie jar
  riotid probe                 Probe live leaderboard/name/match endpoints
  riotid help                  Show this help
`

const printSession = (session: AuthSession, cookieFile: string) =>
  Effect.logInfo(
    `Authenticated ${session.puuid} · region ${session.region} · token expires ${new Date(
      session.expiresAt,
    ).toISOString()} · jar ${cookieFile}`,
  )

const renderQr = (url: string) =>
  Effect.sync(() => {
    process.stdout.write(`\nScan with the Riot Mobile app:\n${url}\n\n`)
    qrcode.generate(url, { small: true }, (code) => process.stdout.write(`${code}\n`))
  })

const authLogin = Effect.gen(function* () {
  const config = yield* AppConfig
  const cookies = yield* qrLogin({
    countryCode: config.countryCode,
    timeoutSeconds: config.qrTimeoutSeconds,
    onUrl: renderQr,
  })
  const session = yield* reauth(cookies)

  yield* saveCookieFile(config.cookieFile, session.cookies, 'qr')
  yield* printSession(session, config.cookieFile)
})

const authSave = Effect.gen(function* () {
  const config = yield* AppConfig
  const sourcePath = process.argv[3]
  const input = sourcePath ? readFileSync(sourcePath, 'utf8') : readFileSync(0, 'utf8')
  const cookies = parseCookieInput(input)

  if (Object.keys(cookies).length === 0) {
    return yield* new RiotAuthError({
      message: 'No cookies were found in the input.',
    })
  }

  const session = yield* reauth(cookies)

  yield* saveCookieFile(config.cookieFile, session.cookies, 'paste')
  yield* printSession(session, config.cookieFile)
})

const authCheck = Effect.gen(function* () {
  const config = yield* AppConfig
  const session = yield* refreshSession(config.cookieFile)

  yield* printSession(session, config.cookieFile)
})

const status = Effect.gen(function* () {
  const config = yield* AppConfig
  const file = yield* loadCookieFile(config.cookieFile)

  yield* Effect.logInfo(`riotid api ready on port ${config.port}`)
  yield* Effect.logInfo(
    file
      ? `cookie jar: ${config.cookieFile} · source ${file.source} · updated ${file.updatedAt}`
      : `cookie jar: missing at ${config.cookieFile} · run \`riotid auth:login\``,
  )
})

const main = Effect.gen(function* () {
  const command = process.argv[2] ?? 'serve'

  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(help)
    return
  }

  if (command === 'status') {
    yield* status
    return
  }

  if (command === 'auth:login') {
    yield* authLogin
    return
  }

  if (command === 'auth:save') {
    yield* authSave
    return
  }

  if (command === 'auth:check' || command === 'auth:refresh') {
    yield* authCheck
    return
  }

  if (command === 'probe') {
    const config = yield* AppConfig
    yield* runProbe(config.cookieFile).pipe(Effect.provide(NodeHttpClient.layerNodeHttp))
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

  yield* Effect.forkDetach(
    Effect.gen(function* () {
      while (true) {
        yield* Effect.sleep(`${config.authKeepaliveHours} hours`)
        yield* refreshSession(config.cookieFile).pipe(
          Effect.tap((session) =>
            Effect.logInfo(`auth keepalive: region ${session.region}; tokens refreshed`),
          ),
          Effect.catch((error) => Effect.logWarning(`auth keepalive failed: ${error.message}`)),
        )
      }
    }),
  )

  return yield* Effect.never
})

Effect.runPromise(main).catch((error: unknown) => {
  if (error instanceof RiotAuthError) {
    process.stderr.write(`${error.message}\n`)
  } else {
    process.stderr.write(`${String(error)}\n`)
  }

  process.exitCode = 1
})
