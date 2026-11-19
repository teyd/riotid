// @effect-diagnostics globalJsonInEffect:off
import { Clock, Effect, Schema } from 'effect'

import {
  cookieHeader,
  cookiesFromResponse,
  loadCookieFile,
  mergeCookieJar,
  saveCookieFile,
  type CookieFileError,
  type CookieJar,
} from './cookies.ts'
import { RiotAuthError } from './errors.ts'
import { fetchManual, readJson, UA_AUTH } from './http.ts'

const cookieReauthUrl =
  'https://auth.riotgames.com/authorize?redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in&client_id=play-valorant-web-prod&response_type=token%20id_token&nonce=1&scope=account%20openid'
const entitlementsUrl = 'https://entitlements.auth.riotgames.com/api/token/v1'
const geoUrl = 'https://riot-geo.pas.si.riotgames.com/pas/v1/product/valorant'
const userInfoUrl = 'https://auth.riotgames.com/userinfo'

const Entitlements = Schema.Struct({
  entitlements_token: Schema.String,
})

const Geo = Schema.Struct({
  affinities: Schema.Struct({
    live: Schema.String,
  }),
})

const UserInfo = Schema.Struct({
  sub: Schema.String,
  country: Schema.optional(Schema.String),
})

export type AuthSession = {
  readonly cookies: CookieJar
  readonly accessToken: string
  readonly idToken: string
  readonly entitlementsToken: string
  readonly region: string
  readonly puuid: string
  readonly country: string | undefined
  readonly expiresAt: number
}

export type ReauthTokens = {
  readonly accessToken: string
  readonly idToken: string
  readonly expiresIn: number
}

export const parseReauthLocation = (location: string): ReauthTokens => {
  if (location.includes('authenticate.riotgames.com/login')) {
    throw new RiotAuthError({
      message: 'Riot cookies are expired. Run `riotid auth:login` to sign in again.',
    })
  }

  const params = new URLSearchParams(new URL(location).hash.slice(1))
  const accessToken = params.get('access_token')
  const idToken = params.get('id_token')
  const expiresIn = Number(params.get('expires_in') ?? '3600')

  if (!accessToken || !idToken || !Number.isFinite(expiresIn)) {
    throw new RiotAuthError({
      message: 'Riot reauth response did not contain tokens.',
    })
  }

  return { accessToken, idToken, expiresIn }
}

const regionToAffinity = (region: string): string => {
  switch (region) {
    case 'na':
    case 'latam':
    case 'br':
      return 'na'
    case 'eu':
      return 'eu'
    case 'ap':
      return 'ap'
    case 'kr':
      return 'kr'
    default:
      return 'na'
  }
}

export const reauth = (cookies: CookieJar): Effect.Effect<AuthSession, RiotAuthError> =>
  Effect.gen(function* () {
    const response = yield* fetchManual(cookieReauthUrl, {
      headers: {
        cookie: cookieHeader(cookies),
        'user-agent': UA_AUTH,
      },
    })

    const location = response.headers.get('location')

    if (!location) {
      return yield* new RiotAuthError({
        message: `Riot reauth returned HTTP ${response.status} without a redirect.`,
        status: response.status,
      })
    }

    const tokens = yield* Effect.try({
      try: () => parseReauthLocation(location),
      catch: (error) =>
        error instanceof RiotAuthError
          ? error
          : new RiotAuthError({ message: `Could not parse reauth redirect: ${String(error)}` }),
    })

    const nextCookies = mergeCookieJar(cookies, cookiesFromResponse(response))
    const authorization = `Bearer ${tokens.accessToken}`

    const entitlementsResponse = yield* fetchManual(entitlementsUrl, {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
    })
    const entitlements = yield* Schema.decodeUnknownEffect(Entitlements)(
      yield* readJson(entitlementsResponse),
    ).pipe(
      Effect.mapError(
        () =>
          new RiotAuthError({
            message: 'Could not decode the entitlements response.',
          }),
      ),
    )

    const geoResponse = yield* fetchManual(geoUrl, {
      method: 'PUT',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ id_token: tokens.idToken }),
    })
    const geo = yield* Schema.decodeUnknownEffect(Geo)(yield* readJson(geoResponse)).pipe(
      Effect.mapError(
        () =>
          new RiotAuthError({
            message: 'Could not decode the Riot Geo response.',
          }),
      ),
    )

    const userResponse = yield* fetchManual(userInfoUrl, {
      headers: { authorization },
    })
    const user = yield* Schema.decodeUnknownEffect(UserInfo)(yield* readJson(userResponse)).pipe(
      Effect.mapError(
        () =>
          new RiotAuthError({
            message: 'Could not decode the Riot userinfo response.',
          }),
      ),
    )

    const now = yield* Clock.currentTimeMillis

    return {
      cookies: nextCookies,
      accessToken: tokens.accessToken,
      idToken: tokens.idToken,
      entitlementsToken: entitlements.entitlements_token,
      region: regionToAffinity(geo.affinities.live),
      puuid: user.sub,
      country: user.country,
      expiresAt: now + tokens.expiresIn * 1000,
    }
  })

export const refreshSession = (
  cookieFile: string,
): Effect.Effect<AuthSession, RiotAuthError | CookieFileError> =>
  Effect.gen(function* () {
    const file = yield* loadCookieFile(cookieFile)

    if (!file) {
      return yield* new RiotAuthError({
        message: `No cookie jar at ${cookieFile}. Run \`riotid auth:login\`.`,
      })
    }

    const session = yield* reauth(file.cookies)
    yield* saveCookieFile(cookieFile, session.cookies, file.source)
    return session
  })

export const refreshSessionIfStale = (
  cookieFile: string,
  maxAgeMs: number,
): Effect.Effect<AuthSession | null, RiotAuthError | CookieFileError> =>
  Effect.gen(function* () {
    const file = yield* loadCookieFile(cookieFile)

    if (!file) {
      return yield* new RiotAuthError({
        message: `No cookie jar at ${cookieFile}. Run \`riotid auth:login\`.`,
      })
    }

    const now = yield* Clock.currentTimeMillis
    const updatedAt = Date.parse(file.updatedAt)

    if (Number.isFinite(updatedAt) && now - updatedAt < maxAgeMs) {
      return null
    }

    const session = yield* reauth(file.cookies)
    yield* saveCookieFile(cookieFile, session.cookies, file.source)
    return session
  })
