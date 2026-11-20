// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalDateInEffect:off
import { createHash } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib'

import type {
  ApiError,
  Health,
  PlayerPage,
  PlayerSearch,
  PlayerSort,
  Region,
  ServiceStatus,
  SiteOverview,
} from '@riotid/contracts'
import {
  buildSiteIndex,
  buildSiteOverview,
  Database,
  decodePlayerCursor,
  defaultIndexPlayerLimit,
  defaultPlayerPageSize,
  listPlayersPage,
  loadPlayerDetail,
  maxPlayerPageSize,
  readDatabase,
  readIndexVersion,
  searchDefaultLimit,
  searchMaxLimit,
  searchPlayers,
} from '@riotid/db'
import { repoRoot } from '@riotid/config'
import { getConnInfo } from '@hono/node-server/conninfo'
import { serveStatic } from '@hono/node-server/serve-static'
import { sql } from 'drizzle-orm'
import { Effect, ManagedRuntime } from 'effect'
import { Hono, type Context } from 'hono'
import { compress } from 'hono/compress'

export type AppOptions = {
  readonly databasePath: string
  readonly cookieFile?: string
  readonly authRefreshMinutes?: number
  readonly webRoot?: string
  readonly indexWindowDays?: number
  readonly indexPlayerLimit?: number
  readonly scanIntervalHours?: number
  readonly rateLimits?: {
    readonly index?: number
    readonly browse?: number
    readonly overview?: number
    readonly players?: number
    readonly search?: number
    readonly status?: number
  }
}

type CachedJson = {
  readonly key: string
  readonly json: string
  readonly gzip: ArrayBuffer
  readonly br: ArrayBuffer
  readonly etag: string
}

const encodeCached = (key: string, value: unknown, etag: string): CachedJson => {
  const json = JSON.stringify(value)
  const gzip = gzipSync(json)
  const br = brotliCompressSync(json, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } })

  return {
    key,
    json,
    gzip: gzip.buffer.slice(gzip.byteOffset, gzip.byteOffset + gzip.byteLength) as ArrayBuffer,
    br: br.buffer.slice(br.byteOffset, br.byteOffset + br.byteLength) as ArrayBuffer,
    etag,
  }
}

const indexFormat = 6

type Bucket = { count: number; resetAt: number }

type LimitState = { limited: boolean; limit: number; remaining: number; resetAt: number }

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
  c.json(errorBody(c, 'rate_limited', 'Too many requests. Try again shortly.'), 429)

const normalizeEtag = (value: string): string => value.trim().replace(/^W\//, '')

const parseIfNoneMatch = (header: string | undefined, etag: string): boolean =>
  header?.split(',').some((value) => normalizeEtag(value) === normalizeEtag(etag)) ?? false

const searchRegions: ReadonlySet<string> = new Set<Region>(['na', 'eu', 'ap', 'kr'])
const playerSorts: ReadonlySet<string> = new Set<PlayerSort>([
  'recentChanges',
  'changes',
  'recent',
  'new',
  'name',
])

const parseRegion = (value: string | undefined): Region | null | undefined => {
  if (value === undefined || value === 'all') return null
  return searchRegions.has(value) ? (value as Region) : undefined
}

export const makeApp = (options: AppOptions) => {
  const app = new Hono<{ Variables: { requestId: string } }>()
  const runtime = ManagedRuntime.make(readDatabase(options.databasePath))
  const runDb = <A, E>(effect: Effect.Effect<A, E, Database>) => runtime.runPromise(effect)
  const limits = {
    index: options.rateLimits?.index ?? 30,
    browse: options.rateLimits?.browse ?? 120,
    overview: options.rateLimits?.overview ?? 60,
    players: options.rateLimits?.players ?? 120,
    search: options.rateLimits?.search ?? 120,
    status: options.rateLimits?.status ?? 60,
  }
  const cookieFile = options.cookieFile ?? './data/cookies.json'
  // Two missed refreshes mean the scheduler or the credential is unhealthy.
  const authStaleAfterMs = (options.authRefreshMinutes ?? 45) * 2 * 60_000
  const webRoot = options.webRoot ?? join(repoRoot, 'apps/web/dist')
  const indexWindowDays = options.indexWindowDays ?? 30
  const indexPlayerLimit = options.indexPlayerLimit ?? defaultIndexPlayerLimit
  const scanIntervalHours = options.scanIntervalHours ?? 6
  const buckets = new Map<string, Bucket>()
  let cachedIndex: CachedJson | null = null
  let cachedOverview: { key: string; body: string; etag: string } | null = null

  const hitLimit = (key: string, limit: number, windowMs = 60_000): LimitState => {
    const now = Date.now()
    const bucket = buckets.get(key)

    if (!bucket || bucket.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs }
      buckets.set(key, fresh)
      return { limited: false, limit, remaining: Math.max(0, limit - 1), resetAt: fresh.resetAt }
    }

    bucket.count += 1

    if (buckets.size > 10_000) {
      for (const [entry, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(entry)
      }
    }

    return {
      limited: bucket.count > limit,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: bucket.resetAt,
    }
  }

  const getIndex = Effect.gen(function* () {
    const version = yield* readIndexVersion
    const key = `${options.databasePath}:${indexWindowDays}:${indexPlayerLimit}:${scanIntervalHours}:${version}`

    if (cachedIndex?.key === key) {
      return cachedIndex
    }

    const value = yield* buildSiteIndex(
      Date.now(),
      indexWindowDays,
      scanIntervalHours,
      indexPlayerLimit,
    )
    const cached = encodeCached(
      key,
      value,
      `"${indexFormat}-${value.version}-${value.players.length}"`,
    )
    cachedIndex = cached
    return cached
  })

  const getOverview = Effect.gen(function* () {
    const version = yield* readIndexVersion
    const key = `${options.databasePath}:${indexWindowDays}:${scanIntervalHours}:${version}`

    if (cachedOverview?.key === key) return cachedOverview

    const value = yield* buildSiteOverview(Date.now(), indexWindowDays, scanIntervalHours)
    const cached = {
      key,
      body: JSON.stringify(value satisfies SiteOverview),
      etag: `"overview-${version}"`,
    }
    cachedOverview = cached
    return cached
  })

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
      "default-src 'self'; img-src 'self' data: https://media.valorant-api.com https://umami.teyd.dev; style-src 'self' 'unsafe-inline'; script-src 'self' https://umami.teyd.dev; connect-src 'self' https://umami.teyd.dev; font-src 'self'; frame-ancestors 'none'; base-uri 'none'",
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
    const state = hitLimit(`${scope}:${ip}`, limit)
    const reset = Math.max(0, Math.ceil((state.resetAt - Date.now()) / 1000))

    c.header('RateLimit-Limit', String(state.limit))
    c.header('RateLimit-Remaining', String(state.remaining))
    c.header('RateLimit-Reset', String(reset))
    if (state.limited) c.header('Retry-After', String(reset))

    return state.limited
  }

  app.get('/api/v1/index', async (c) => {
    if (await rateLimit(c, 'index', limits.index)) return rateLimited(c)

    const index = await runDb(getIndex)

    c.header('ETag', index.etag)
    c.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')

    if (parseIfNoneMatch(c.req.header('if-none-match'), index.etag)) {
      return c.body(null, 304)
    }

    const accepts = c.req.header('accept-encoding') ?? ''

    if (accepts.includes('br')) {
      return c.body(index.br, 200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'br',
        Vary: 'Accept-Encoding',
      })
    }

    if (accepts.includes('gzip')) {
      return c.body(index.gzip, 200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
        Vary: 'Accept-Encoding',
      })
    }

    return c.body(index.json, 200, { 'Content-Type': 'application/json; charset=utf-8' })
  })

  app.get('/api/v1/search', async (c) => {
    if (await rateLimit(c, 'search', limits.search)) return rateLimited(c)

    const query = (c.req.query('q') ?? '').trim()

    if (query.length > 64) {
      return c.json(errorBody(c, 'invalid_query', 'Search query is too long.'), 400)
    }

    const limitValue = c.req.query('limit')
    const limit = limitValue === undefined ? searchDefaultLimit : Number(limitValue)

    if (!Number.isInteger(limit) || limit < 1 || limit > searchMaxLimit) {
      return c.json(
        errorBody(c, 'invalid_limit', `Limit must be between 1 and ${searchMaxLimit}.`),
        400,
      )
    }

    const region = parseRegion(c.req.query('region'))

    if (region === undefined) {
      return c.json(errorBody(c, 'invalid_region', 'Invalid region.'), 400)
    }

    const results = await runDb(
      searchPlayers(query, { region, limit, now: Date.now(), indexWindowDays }),
    )

    return c.json(results satisfies PlayerSearch, 200, {
      'Cache-Control': 'public, max-age=30, s-maxage=30',
    })
  })

  app.get('/api/v1/overview', async (c) => {
    if (await rateLimit(c, 'overview', limits.overview)) return rateLimited(c)

    const overview = await runDb(getOverview)
    c.header('ETag', overview.etag)
    c.header('Cache-Control', 'public, max-age=60, s-maxage=300')

    if (parseIfNoneMatch(c.req.header('if-none-match'), overview.etag)) {
      return c.body(null, 304)
    }

    return c.body(overview.body, 200, { 'Content-Type': 'application/json; charset=utf-8' })
  })

  app.get('/api/v1/players', async (c) => {
    if (await rateLimit(c, 'browse', limits.browse)) return rateLimited(c)

    const sortValue = c.req.query('sort') ?? 'recentChanges'

    if (!playerSorts.has(sortValue)) {
      return c.json(errorBody(c, 'invalid_sort', 'Invalid player sort.'), 400)
    }

    const sort = sortValue as PlayerSort
    const region = parseRegion(c.req.query('region'))

    if (region === undefined) {
      return c.json(errorBody(c, 'invalid_region', 'Invalid region.'), 400)
    }

    const limitValue = c.req.query('limit')
    const limit = limitValue === undefined ? defaultPlayerPageSize : Number(limitValue)

    if (!Number.isInteger(limit) || limit < 1 || limit > maxPlayerPageSize) {
      return c.json(
        errorBody(c, 'invalid_limit', `Limit must be between 1 and ${maxPlayerPageSize}.`),
        400,
      )
    }

    const cursorValue = c.req.query('cursor')
    const cursor = cursorValue === undefined ? null : decodePlayerCursor(cursorValue)

    if (cursorValue !== undefined && (cursor === null || cursor.sort !== sort)) {
      return c.json(errorBody(c, 'invalid_cursor', 'Invalid player cursor.'), 400)
    }

    const page = await runDb(
      listPlayersPage({
        sort,
        region,
        cursor,
        limit,
        now: Date.now(),
        indexWindowDays,
      }),
    )

    return c.json(page satisfies PlayerPage, 200, {
      'Cache-Control': 'public, max-age=30, s-maxage=60',
    })
  })

  app.get('/api/v1/status', async (c) => {
    if (await rateLimit(c, 'status', limits.status)) return rateLimited(c)

    const updatedAt = await fs
      .stat(cookieFile)
      .then((stat) => stat.mtimeMs)
      .catch(() => null)

    return c.json(
      { auth: { updatedAt, staleAfterMs: authStaleAfterMs } } satisfies ServiceStatus,
      200,
      { 'Cache-Control': 'no-store' },
    )
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

    const body = JSON.stringify(detail)
    const etag = `"player-${createHash('sha1').update(body).digest('base64url').slice(0, 16)}"`

    c.header('ETag', etag)
    c.header('Cache-Control', 'public, max-age=300, s-maxage=600')

    if (parseIfNoneMatch(c.req.header('if-none-match'), etag)) {
      return c.body(null, 304)
    }

    return c.body(body, 200, { 'Content-Type': 'application/json; charset=utf-8' })
  })

  app.all('/api/*', (c) =>
    c.json(errorBody(c, 'not_found', 'Route not found.'), 404, { 'Cache-Control': 'no-store' }),
  )

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
