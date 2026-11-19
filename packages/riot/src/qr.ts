// @effect-diagnostics globalFetchInEffect:off globalJsonInEffect:off cryptoRandomUUIDInEffect:off
import { Clock, Duration, Effect, Option, Schema } from 'effect'

import { cookieHeader, cookiesFromResponse, mergeCookieJar, type CookieJar } from './cookies.ts'
import { RiotAuthError } from './errors.ts'
import { fetchManual, readJson, UA_AUTH, UA_AUTHN, UA_AUTH_EXCH, UA_CONFIG } from './http.ts'

const loginUrl = 'https://authenticate.riotgames.com/api/v1/login'
const loginTokenUrl = 'https://auth.riotgames.com/api/v1/login-token'
const authorizationUrl = 'https://auth.riotgames.com/api/v1/authorization'
const clientConfigUrl =
  'https://clientconfig.rpg.riotgames.com/api/v1/config/public?os=windows&region=en&app=Riot%20Client&version=97.0.1.2366&patchline=KeystoneFoundationLiveWin'
const openIdConfigUrl = 'https://auth.riotgames.com/.well-known/openid-configuration'

const sessionRefreshAfterMs = 50_000
const pollInterval = Duration.seconds(2)

const QrCreate = Schema.Struct({
  cluster: Schema.String,
  suuid: Schema.String,
  timestamp: Schema.String,
})

const QrPoll = Schema.Struct({
  type: Schema.optional(Schema.String),
  success: Schema.optional(
    Schema.Struct({
      login_token: Schema.String,
    }),
  ),
})

export type QrSession = {
  readonly loginUrl: string
  readonly cookies: CookieJar
  readonly sdkSid: string
  readonly createdAt: number
}

const traceHeaders = (sdkSid: string, countryCode?: string): Record<string, string> => {
  const traceId = crypto.randomUUID().replaceAll('-', '')
  const parentId = crypto.randomUUID().replaceAll('-', '').slice(0, 16)

  return {
    accept: 'application/json',
    'accept-encoding': 'deflate, gzip, zstd',
    connection: 'keep-alive',
    baggage: `sdksid=${sdkSid}`,
    traceparent: `00-${traceId}-${parentId}-00`,
    ...(countryCode ? { 'country-code': countryCode } : {}),
  }
}

export const createQrSession = (countryCode: string): Effect.Effect<QrSession, RiotAuthError> =>
  Effect.gen(function* () {
    const sdkSid = crypto.randomUUID()
    const headers = traceHeaders(sdkSid, countryCode)

    yield* Effect.ignore(
      fetchManual(clientConfigUrl, {
        headers: { ...headers, 'user-agent': UA_CONFIG },
      }),
    )
    yield* Effect.ignore(
      fetchManual(openIdConfigUrl, {
        headers: { ...headers, 'user-agent': UA_AUTH },
      }),
    )

    const response = yield* fetchManual(loginUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'application/json',
        'user-agent': UA_AUTHN,
      },
      body: JSON.stringify({
        client_id: 'riot-client',
        language: 'en',
        platform: 'windows',
        remember: true,
        type: 'auth',
        qrcode: {},
      }),
    })

    const body = yield* Schema.decodeUnknownEffect(QrCreate)(yield* readJson(response)).pipe(
      Effect.mapError(
        () =>
          new RiotAuthError({
            message: `Riot did not return a QR session (HTTP ${response.status}).`,
            status: response.status,
          }),
      ),
    )

    const url = new URL('https://qrlogin.riotgames.com/riotmobile')
    url.searchParams.set('cluster', body.cluster)
    url.searchParams.set('suuid', body.suuid)
    url.searchParams.set('timestamp', body.timestamp)
    url.searchParams.set('utm_source', 'riotclient')
    url.searchParams.set('utm_medium', 'client')
    url.searchParams.set('utm_campaign', 'qrlogin-riotmobile')

    const createdAt = yield* Clock.currentTimeMillis

    return {
      loginUrl: url.toString(),
      cookies: cookiesFromResponse(response),
      sdkSid,
      createdAt,
    }
  })

export const pollQrSession = (
  session: QrSession,
  countryCode: string,
): Effect.Effect<Option.Option<string>, RiotAuthError> =>
  Effect.gen(function* () {
    const response = yield* fetchManual(loginUrl, {
      headers: {
        ...traceHeaders(session.sdkSid, countryCode),
        'user-agent': UA_AUTHN,
        cookie: cookieHeader(session.cookies),
      },
    })

    if (response.status !== 200) {
      return yield* Effect.succeedNone
    }

    const decoded = Schema.decodeUnknownOption(QrPoll)(yield* readJson(response))

    if (Option.isNone(decoded) || decoded.value.type !== 'success') {
      return yield* Effect.succeedNone
    }

    return decoded.value.success ? Option.some(decoded.value.success.login_token) : Option.none()
  }).pipe(Effect.catchTag('RiotAuthError', () => Effect.succeedNone))

export const exchangeQrLogin = (loginToken: string): Effect.Effect<CookieJar, RiotAuthError> =>
  Effect.gen(function* () {
    const sdkSid = crypto.randomUUID()
    const headers = traceHeaders(sdkSid)

    const tokenResponse = yield* fetchManual(loginTokenUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'application/json',
        'user-agent': UA_AUTH_EXCH,
      },
      body: JSON.stringify({
        authentication_type: null,
        code_verifier: '',
        login_token: loginToken,
        persist_login: false,
      }),
    })

    if (tokenResponse.status !== 204) {
      return yield* new RiotAuthError({
        message: `Riot rejected the QR login token (HTTP ${tokenResponse.status}).`,
        status: tokenResponse.status,
      })
    }

    const authorizationResponse = yield* fetchManual(authorizationUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'application/json',
        'user-agent': UA_AUTH_EXCH,
      },
      body: JSON.stringify({
        acr_values: '',
        claims: '',
        client_id: 'riot-client',
        code_challenge: '',
        code_challenge_method: '',
        nonce: crypto.randomUUID(),
        redirect_uri: 'http://localhost/redirect',
        response_type: 'token id_token',
        scope: 'openid link ban lol_region account',
      }),
    })

    if (authorizationResponse.status >= 400) {
      return yield* new RiotAuthError({
        message: `Riot authorization failed (HTTP ${authorizationResponse.status}).`,
        status: authorizationResponse.status,
      })
    }

    const cookies = mergeCookieJar(
      cookiesFromResponse(tokenResponse),
      cookiesFromResponse(authorizationResponse),
    )

    if (Object.keys(cookies).length === 0) {
      return yield* new RiotAuthError({
        message: 'Riot returned no session cookies for the QR login.',
      })
    }

    return cookies
  })

export type QrLoginOptions = {
  readonly countryCode: string
  readonly timeoutSeconds: number
  readonly onUrl: (url: string) => Effect.Effect<void>
}

export const qrLogin = (options: QrLoginOptions): Effect.Effect<CookieJar, RiotAuthError> =>
  Effect.gen(function* () {
    const deadline = (yield* Clock.currentTimeMillis) + options.timeoutSeconds * 1000
    let session = yield* createQrSession(options.countryCode)
    yield* options.onUrl(session.loginUrl)

    let loginToken: string | undefined

    while (loginToken === undefined) {
      const now = yield* Clock.currentTimeMillis

      if (now >= deadline) {
        return yield* new RiotAuthError({
          message: 'QR login timed out. Run `riotid auth:login` again.',
        })
      }

      if (now - session.createdAt >= sessionRefreshAfterMs) {
        session = yield* createQrSession(options.countryCode)
        yield* options.onUrl(session.loginUrl)
      }

      const polled = yield* pollQrSession(session, options.countryCode)

      if (Option.isSome(polled)) {
        loginToken = polled.value
        break
      }

      yield* Effect.sleep(pollInterval)
    }

    return yield* exchangeQrLogin(loginToken)
  })
