import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ServiceStatus } from '@riotid/contracts'
import { anonymousRows, Database, identityLinks, seedDatabase } from '@riotid/db'
import { migrate, runDb, withDatabase } from '@riotid/test-utils'
import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { makeApp, type AppOptions } from './app.ts'

const withApp = async (
  run: (app: ReturnType<typeof makeApp>, path: string) => Promise<void>,
  options: Omit<AppOptions, 'databasePath'> = {},
): Promise<void> => {
  await withDatabase('riotid-api-', async (path) => {
    await migrate(path)
    await runDb(path, seedDatabase)
    await run(makeApp({ databasePath: path, ...options }), path)
  })
}

const request = (app: ReturnType<typeof makeApp>, path: string, init?: RequestInit) =>
  app.request(`http://localhost${path}`, init)

describe('api', () => {
  it('reports health', async () => {
    await withApp(async (app) => {
      const response = await request(app, '/healthz')
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ ok: true, service: 'riotid-api' })
    })
  })

  it('reports cookie freshness without exposing the jar', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'riotid-cookie-'))
    const cookieFile = join(directory, 'cookies.json')
    const refreshedAt = Date.UTC(2026, 10, 19, 22, 33, 0)

    try {
      await writeFile(cookieFile, '{"version":1,"cookies":{"ssid":"secret"}}')
      await utimes(cookieFile, refreshedAt / 1000, refreshedAt / 1000)

      await withApp(
        async (app) => {
          const response = await request(app, '/api/v1/status')
          expect(response.status).toBe(200)
          expect(response.headers.get('cache-control')).toBe('no-store')

          const body = (await response.json()) as ServiceStatus
          expect(body.auth.updatedAt).not.toBeNull()
          expect(Math.abs((body.auth.updatedAt ?? 0) - refreshedAt)).toBeLessThan(1_000)
          expect(body.auth.staleAfterMs).toBe(90 * 60_000)
          expect(JSON.stringify(body)).not.toContain('secret')
        },
        { cookieFile, authRefreshMinutes: 45 },
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('reports a missing cookie jar as null', async () => {
    await withApp(
      async (app) => {
        const response = await request(app, '/api/v1/status')
        expect(response.status).toBe(200)
        const body = (await response.json()) as ServiceStatus
        expect(body.auth.updatedAt).toBeNull()
      },
      { cookieFile: join(tmpdir(), 'riotid-no-cookie.json') },
    )
  })

  it('serves a cacheable index filtered to public players', async () => {
    await withApp(async (app) => {
      const response = await request(app, '/api/v1/index')
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toContain('s-maxage=300')
      expect(response.headers.get('x-request-id')).toBeTruthy()

      const body = (await response.json()) as {
        version: number
        players: Array<[string, string, string, string, number]>
        stats: {
          players: number
          linked: number
          unresolved: number
          lastRunAt: number
          nextRunAt: number
        }
      }

      expect(body.version).toBe(1)
      expect(body.players).toHaveLength(2)
      expect(body.players.map((row) => row[0])).not.toContain('seed-player-3')
      expect(body.stats.unresolved).toBe(1)
      expect(body.stats.nextRunAt - body.stats.lastRunAt).toBe(6 * 3_600_000)

      const changed = body.players.find((row) => row[0] === 'seed-player-1')
      expect(changed?.[1]).toBe('Seed One')
      expect(changed?.[4]).toBe(2)

      const etag = response.headers.get('etag')
      expect(etag).toBeTruthy()
      const cached = await request(app, '/api/v1/index', {
        headers: { 'if-none-match': etag ?? '' },
      })
      expect(cached.status).toBe(304)
    })
  })

  it('plans the next scan from the configured interval', async () => {
    await withApp(
      async (app) => {
        const response = await request(app, '/api/v1/index')
        const body = (await response.json()) as {
          stats: { lastRunAt: number; nextRunAt: number }
        }

        expect(body.stats.nextRunAt - body.stats.lastRunAt).toBe(2 * 3_600_000)
      },
      { scanIntervalHours: 2 },
    )
  })

  it('serves player timelines and link evidence', async () => {
    await withApp(async (app, path) => {
      await runDb(
        path,
        Effect.gen(function* () {
          const db = yield* Database
          const anonymous = yield* db.select().from(anonymousRows)
          yield* db.insert(identityLinks).values({
            anonymousRowId: anonymous[0]?.id ?? 0,
            puuid: 'seed-player-1',
            region: 'eu',
            seasonId: anonymous[0]?.seasonId ?? 'seed',
            matchId: 'match-1',
            method: 'match_graph',
            confidence: 9995,
            evidence: { leaderboardRank: 17, rankedRating: 1090 },
          })
        }),
      )

      const response = await request(app, '/api/v1/players/seed-player-1')
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toContain('s-maxage=600')

      const detailEtag = response.headers.get('etag')
      expect(detailEtag).toBeTruthy()

      const revalidated = await request(app, '/api/v1/players/seed-player-1', {
        headers: { 'if-none-match': detailEtag ?? '' },
      })
      expect(revalidated.status).toBe(304)
      expect(await revalidated.text()).toBe('')

      const body = (await response.json()) as {
        player: { name: string; region: string; isBanned: boolean }
        names: unknown[]
        regions: unknown[]
        links: Array<{ matchId: string; method: string; confidence: number }>
      }

      expect(body.player.name).toBe('Seed One')
      expect(body.player.region).toBe('eu')
      expect(body.names).toHaveLength(2)
      expect(body.regions).toHaveLength(1)
      expect(body.links[0]?.matchId).toBe('match-1')
      expect(body.links[0]?.method).toBe('match_graph')
      expect(body.links[0]?.confidence).toBe(9995)

      const missing = await request(app, '/api/v1/players/unknown-player')
      expect(missing.status).toBe(404)

      const invalid = await request(app, '/api/v1/players/short')
      expect(invalid.status).toBe(400)
    })
  })

  it('does not expose removed operational endpoints', async () => {
    await withApp(async (app) => {
      for (const path of ['/api/v1/stats', '/api/v1/crawler', '/api/v1/crawler/stream']) {
        const response = await request(app, path)
        expect(response.status).toBe(404)
      }
    })
  })

  it('keeps removed API routes at 404 while serving the SPA', async () => {
    const webRoot = await mkdtemp(join(tmpdir(), 'riotid-web-'))
    await writeFile(join(webRoot, 'index.html'), '<!doctype html><html></html>')

    try {
      await withApp(
        async (app) => {
          const removed = await request(app, '/api/v1/stats')
          expect(removed.status).toBe(404)
          expect(removed.headers.get('content-type')).toContain('application/json')

          const spa = await request(app, '/stats')
          expect(spa.status).toBe(200)
          expect(await spa.text()).toContain('<!doctype html>')
        },
        { webRoot },
      )
    } finally {
      await rm(webRoot, { recursive: true, force: true })
    }
  })

  it('sets security headers and blocks unknown routes', async () => {
    await withApp(async (app) => {
      const response = await request(app, '/api/v1/missing')
      expect(response.status).toBe(404)
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      expect(response.headers.get('x-frame-options')).toBe('DENY')
      expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
      const body = (await response.json()) as { error: { code: string; requestId: string } }
      expect(body.error.code).toBe('not_found')
      expect(body.error.requestId).toBeTruthy()

      const robots = await request(app, '/robots.txt')
      expect(await robots.text()).toContain('Disallow: /api')
    })
  })

  it('rate limits per client', async () => {
    await withApp(
      async (app) => {
        const first = await request(app, '/api/v1/index', {
          headers: { 'cf-connecting-ip': '203.0.113.7' },
        })
        expect(first.status).toBe(200)

        const second = await request(app, '/api/v1/index', {
          headers: { 'cf-connecting-ip': '203.0.113.7' },
        })
        expect(second.status).toBe(429)
        expect(second.headers.get('retry-after')).toBe('60')
        const body = (await second.json()) as { error: { code: string } }
        expect(body.error.code).toBe('rate_limited')

        const other = await request(app, '/api/v1/index', {
          headers: { 'cf-connecting-ip': '203.0.113.8' },
        })
        expect(other.status).toBe(200)
      },
      { rateLimits: { index: 1 } },
    )
  })

  it('keeps rate-limit buckets scoped to each app instance', async () => {
    const ip = { 'cf-connecting-ip': '198.51.100.9' }

    await withApp(
      async (first) => {
        expect((await request(first, '/api/v1/index', { headers: ip })).status).toBe(200)
        expect((await request(first, '/api/v1/index', { headers: ip })).status).toBe(429)

        await withApp(
          async (second) => {
            expect((await request(second, '/api/v1/index', { headers: ip })).status).toBe(200)
          },
          { rateLimits: { index: 1 } },
        )
      },
      { rateLimits: { index: 1 } },
    )
  })

  it('rejects malformed queries at the database boundary', async () => {
    await withApp(async (app) => {
      const response = await request(app, '/api/v1/players/%3Cscript%3E')
      expect(response.status).toBe(400)
    })
  })
})
