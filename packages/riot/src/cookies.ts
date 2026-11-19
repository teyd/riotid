// @effect-diagnostics nodeBuiltinImport:off
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

import { Clock, Data, Effect, Schema } from 'effect'

export type CookieJar = Record<string, string>

export class CookieFileError extends Data.TaggedError('CookieFileError')<{
  readonly message: string
}> {}

export const CookieFile = Schema.Struct({
  version: Schema.Literal(1),
  source: Schema.Literals(['qr', 'paste']),
  updatedAt: Schema.String,
  cookies: Schema.Record(Schema.String, Schema.String),
})

export type CookieFile = typeof CookieFile.Type

const CookieFileJson = Schema.fromJsonString(CookieFile)
const UnknownJson = Schema.fromJsonString(Schema.Unknown)

const ignoredCookieNames = new Set([
  'path',
  'domain',
  'expires',
  'max-age',
  'secure',
  'httponly',
  'samesite',
  'priority',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseCookieHeader = (input: string): CookieJar => {
  const jar: CookieJar = {}

  for (const part of input.split(';')) {
    const separator = part.indexOf('=')

    if (separator <= 0) {
      continue
    }

    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()

    if (name.length > 0 && !ignoredCookieNames.has(name.toLowerCase())) {
      jar[name] = value
    }
  }

  return jar
}

export const parseCookieInput = (input: string): CookieJar => {
  const trimmed = input.trim()

  if (trimmed.length === 0) {
    return {}
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const value = Schema.decodeSync(UnknownJson)(trimmed)

    if (Array.isArray(value)) {
      const jar: CookieJar = {}

      for (const item of value) {
        if (isRecord(item) && typeof item.name === 'string' && typeof item.value === 'string') {
          jar[item.name] = item.value
        }
      }

      return jar
    }

    if (isRecord(value)) {
      if (isRecord(value.cookies)) {
        return parseCookieRecord(value.cookies)
      }

      return parseCookieRecord(value)
    }

    return {}
  }

  if (trimmed.includes('\t')) {
    const jar: CookieJar = {}

    for (const line of trimmed.split(/\r?\n/)) {
      if (line.length === 0 || line.startsWith('#')) {
        continue
      }

      const parts = line.split('\t')

      if (parts.length >= 7 && parts[5] && parts[6] !== undefined) {
        jar[parts[5]] = parts[6]
      }
    }

    return jar
  }

  return parseCookieHeader(trimmed)
}

const parseCookieRecord = (value: Record<string, unknown>): CookieJar => {
  const jar: CookieJar = {}

  for (const [name, cookieValue] of Object.entries(value)) {
    if (typeof cookieValue === 'string' && !ignoredCookieNames.has(name.toLowerCase())) {
      jar[name] = cookieValue
    }
  }

  return jar
}

export const cookieHeader = (jar: CookieJar): string =>
  Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')

export const mergeCookieJar = (jar: CookieJar, next: CookieJar): CookieJar => {
  const merged = { ...jar }

  for (const [name, value] of Object.entries(next)) {
    if (value.length === 0) {
      delete merged[name]
    } else {
      merged[name] = value
    }
  }

  return merged
}

export const cookiesFromResponse = (response: Response): CookieJar => {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  const values = headers.getSetCookie?.() ?? []

  const jar: CookieJar = {}

  for (const value of values) {
    const separator = value.indexOf('=')

    if (separator <= 0) {
      continue
    }

    const name = value.slice(0, separator).trim()
    const cookieValue =
      value
        .slice(separator + 1)
        .split(';', 1)[0]
        ?.trim() ?? ''

    if (name.length > 0) {
      jar[name] = cookieValue
    }
  }

  return jar
}

export const loadCookieFile = (path: string): Effect.Effect<CookieFile | null, CookieFileError> =>
  Effect.gen(function* () {
    const text = yield* Effect.tryPromise({
      try: async () => {
        try {
          return await fs.readFile(path, 'utf8')
        } catch (error) {
          if (isRecord(error) && error.code === 'ENOENT') {
            return null
          }

          throw error
        }
      },
      catch: (error) =>
        new CookieFileError({
          message: `Could not read cookie file ${path}: ${String(error)}`,
        }),
    })

    if (text === null) {
      return null
    }

    return yield* Schema.decodeEffect(CookieFileJson)(text).pipe(
      Effect.mapError(
        () =>
          new CookieFileError({
            message: `Cookie file ${path} is not valid JSON.`,
          }),
      ),
    )
  })

export const saveCookieFile = (
  path: string,
  cookies: CookieJar,
  source: CookieFile['source'],
): Effect.Effect<void, CookieFileError> =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    const text = yield* Schema.encodeEffect(CookieFileJson)({
      version: 1,
      source,
      updatedAt: new Date(now).toISOString(),
      cookies,
    }).pipe(
      Effect.mapError(
        () =>
          new CookieFileError({
            message: `Could not serialize the cookie file ${path}.`,
          }),
      ),
    )

    yield* Effect.tryPromise({
      try: async () => {
        await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 })
        const temporary = `${path}.tmp`
        await fs.writeFile(temporary, text, { mode: 0o600 })
        await fs.rename(temporary, path)
        await fs.chmod(path, 0o600)
      },
      catch: (error) =>
        new CookieFileError({
          message: `Could not write cookie file ${path}: ${String(error)}`,
        }),
    })
  })
