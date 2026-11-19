// @effect-diagnostics globalFetchInEffect:off
import { Effect } from 'effect'

import { RiotAuthError } from './errors.ts'

export const UA_CONFIG =
  'RiotGamesApi/24.9.1.4445 client-config (Windows;10;;Professional, x64) riot_client/0'
export const UA_AUTH =
  'RiotGamesApi/24.9.1.4445 rso-auth (Windows;10;;Professional, x64) riot_client/0'
export const UA_AUTHN =
  'RiotGamesApi/24.9.1.4445 rso-authenticator (Windows;10;;Professional, x64) riot_client/0'
export const UA_AUTH_EXCH =
  'RiotGamesApi/24.10.1.4471 rso-auth (Windows;10;;Professional, x64) riot_client/0'

export const fetchManual = (
  url: string,
  init: RequestInit,
): Effect.Effect<Response, RiotAuthError> =>
  Effect.tryPromise({
    try: () => fetch(url, { ...init, redirect: 'manual' }),
    catch: (error) =>
      new RiotAuthError({
        message: `Request failed: ${String(error)}`,
      }),
  })

export const readJson = (response: Response): Effect.Effect<unknown, RiotAuthError> =>
  Effect.tryPromise({
    try: () => response.json() as Promise<unknown>,
    catch: (error) =>
      new RiotAuthError({
        message: `Response was not valid JSON: ${String(error)}`,
        status: response.status,
      }),
  })

export const expectStatus = (
  response: Response,
  expected: ReadonlyArray<number>,
): Effect.Effect<Response, RiotAuthError> =>
  expected.includes(response.status)
    ? Effect.succeed(response)
    : Effect.fail(
        new RiotAuthError({
          message: `Unexpected HTTP ${response.status} from ${response.url}`,
          status: response.status,
        }),
      )
