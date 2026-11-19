// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalDateInEffect:off
import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

import { Database, readDatabase } from '@riotid/db'
import type { ApiError, Health } from '@riotid/contracts'
import { getConnInfo } from '@hono/node-server/conninfo'
import { serveStatic } from '@hono/node-server/serve-static'
import { sql } from 'drizzle-orm'
import { Effect, ManagedRuntime } from 'effect'
import { Hono, type Context } from 'hono'
import { compress } from 'hono/compress'

import {
  buildServiceStatus,
  buildSiteIndex,
  buildSiteStats,
  loadPlayerDetail,
  readIndexVersion,
} from './site.ts'

export type AppOptions = {
  readonly databasePath: string
  readonly cookieFile?: string
  readonly startedAt?: number
  readonly webRoot?: string
  readonly indexWindowDays?: number
  readonly rateLimits?: {
    readonly index?: number
    readonly players?: number
    readonly stats?: number
    readonly status?: number
  }
}

type CachedJson = {
  readonly key: string
  readonly json: string
  readonly gzip: ArrayBuffer
  readonly etag: string
}

let cachedIndex: CachedJson | null = null
let cachedStats: CachedJson | null = null

const getIndex = (databasePath: string, indexWindowDays: number) =>
  Effect.gen(function* () {
    const version = yield* readIndexVersion
    const key = `${databasePath}:${version}`

    if (cachedIndex?.key === key) {
      return cachedIndex
    }

    const value = yield* buildSiteIndex(Date.now(), indexWindowDays)
    const json = JSON.stringify(value)
    const cached = {
      key,
      json,
      gzip: (() => {
        const buffer = gzipSync(json)
        return buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ) as ArrayBuffer
      })(),
      etag: `"${value.version}-${value.players.length}"`,
    }
    cachedIndex = cached
    return cached
  })

const getStats = (databasePath: string) =>
  Effect.gen(function* () {
    const version = yield* readIndexVersion
    const key = `${databasePath}:${version}`

    if (cachedStats?.key === key) {
      return cachedStats
    }

    const value = yield* buildSiteStats
    const json = JSON.stringify(value)
    const buffer = gzipSync(json)
    const cached = {
      key,
      json,
      gzip: buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer,
      etag: `"${version}"`,
    }
    cachedStats = cached
    return cached
  })

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

const hitLimit = (key: string, limit: number, windowMs = 60_000): boolean => {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }

  bucket.count += 1

  if (buckets.size > 10_000) {
    for (const [entry, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(entry)
    }
  }

  return bucket.count > limit
}

const clientIp = async (c: Context): Promise<string> => {
  const forwarded = c.req.header('cf-connecting-ip') ?? c.req.header('x-real-ip')

  if (forwarded) return forwarded

  try {
    return getConnInfo(c).remote.address ?? 'local'
  } catch {
    return 'local'
  }
}

const errorBody = (c: Context, code: string, message: string): ApiError => ({
  error: {
    code,
    message,
    requestId: c.get('requestId') as string,
  },
})

const rateLimited = (c: Context) =>
  c.json(errorBody(c, 'rate_limited', 'Too many requests. Try again shortly.'), 429, {
    'Retry-After': '60',
  })

const normalizeEtag = (value: string): string => value.trim().replace(/^W\//, '')

const parseIfNoneMatch = (header: string | undefined, etag: string): boolean =>
  header?.split(',').some((value) => normalizeEtag(value) === normalizeEtag(etag)) ?? false

export const makeApp = (options: AppOptions) => {
  const app = new Hono<{ Variables: { requestId: string } }>()
  const runtime = ManagedRuntime.make(readDatabase(options.databasePath))
  const runDb = <A, E>(effect: Effect.Effect<A, E, Database>) => runtime.runPromise(effect)
  const startedAt = options.startedAt ?? Date.now()
  const limits = {
    index: options.rateLimits?.index ?? 30,
    players: options.rateLimits?.players ?? 120,
    stats: options.rateLimits?.stats ?? 60,
    status: options.rateLimits?.status ?? 60,
  }
  const webRoot = options.webRoot ?? './apps/web/dist'

  app.use('*', async (c, next) => {
    const requestId = crypto.randomUUID()
    c.set('requestId', requestId)
    c.header('X-Request-Id', requestId)
    await next()
  })

  app.use('*', async (c, next) => {
    await next()
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('X-Robots-Tag', 'noindex')
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    )
  })

  app.use('*', compress())

  app.use('/assets/*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'public, max-age=31536000, immutable')
  })

  app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /api\n'))

  app.get('/healthz', async (c) => {
    try {
      await runDb(
        Effect.gen(function* () {
          const db = yield* Database
          return yield* db.get<{ ok: number }>(sql`select 1 as ok`)
        }),
      )
      return c.json({ ok: true, service: 'riotid-api' } satisfies Health, 200, {
        'Cache-Control': 'no-store',
      })
    } catch {
      return c.json({ ok: false, service: 'riotid-api' } satisfies Health, 503, {
        'Cache-Control': 'no-store',
      })
    }
  })

  const rateLimit = async (c: Context, scope: string, limit: number) => {
    const ip = await clientIp(c)
    return hitLimit(`${scope}:${ip}`, limit)
  }

  app.get('/api/v1/index', async (c) => {
    if (await rateLimit(c, 'index', limits.index)) return rateLimited(c)

    const index = await runDb(getIndex(options.databasePath, options.indexWindowDays ?? 30))

    c.header('ETag', index.etag)
    c.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')

    if (parseIfNoneMatch(c.req.header('if-none-match'), index.etag)) {
      return c.body(null, 304)
    }

    if (c.req.header('accept-encoding')?.includes('gzip')) {
      return c.body(index.gzip, 200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
        Vary: 'Accept-Encoding',
      })
    }

    return c.body(index.json, 200, { 'Content-Type': 'application/json; charset=utf-8' })
  })

  app.get('/api/v1/players/:puuid', async (c) => {
    if (await rateLimit(c, 'players', limits.players)) return rateLimited(c)

    const puuid = c.req.param('puuid')

    if (!puuid || !/^[A-Za-z0-9_-]{8,128}$/.test(puuid)) {
      return c.json(errorBody(c, 'invalid_puuid', 'Invalid puuid.'), 400)
    }

    const detail = await runDb(loadPlayerDetail(puuid))

    if (!detail) {
      return c.json(errorBody(c, 'not_found', 'Player not found.'), 404, {
        'Cache-Control': 'no-store',
      })
    }

    c.header('Cache-Control', 'public, max-age=300, s-maxage=600')
    return c.json(detail)
  })

  app.get('/api/v1/stats', async (c) => {
    if (await rateLimit(c, 'stats', limits.stats)) return rateLimited(c)

    const stats = await runDb(getStats(options.databasePath))
    c.header('Cache-Control', 'public, max-age=300, s-maxage=600')
    c.header('ETag', stats.etag)
    return c.body(stats.json, 200, { 'Content-Type': 'application/json; charset=utf-8' })
  })

  app.get('/api/v1/status', async (c) => {
    if (await rateLimit(c, 'status', limits.status)) return rateLimited(c)

    const cookieUpdatedAt = await fs
      .stat(options.cookieFile ?? './data/cookies.json')
      .then((stat) => stat.mtimeMs)
      .catch(() => null)
    const status = await runDb(
      buildServiceStatus({
        databasePath: options.databasePath,
        cookieFile: options.cookieFile ?? './data/cookies.json',
        cookieUpdatedAt,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      }),
    )

    return c.json(status, 200, { 'Cache-Control': 'no-store' })
  })

  if (existsSync(join(webRoot, 'index.html'))) {
    app.use('*', serveStatic({ root: webRoot }))
    app.get('*', serveStatic({ path: join(webRoot, 'index.html') }))
  }

  app.notFound((c) =>
    c.json(errorBody(c, 'not_found', 'Route not found.'), 404, { 'Cache-Control': 'no-store' }),
  )

  app.onError((error, c) => {
    process.stderr.write(`${new Date().toISOString()} api error: ${String(error)}\n`)
    return c.json(errorBody(c, 'internal_error', 'Internal server error.'), 500, {
      'Cache-Control': 'no-store',
    })
  })

  return app
}

export type AppType = ReturnType<typeof makeApp>
