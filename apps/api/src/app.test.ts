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

  it('serves a cacheable index filtered to public players', async () => {
    await withApp(async (app) => {
      const response = await request(app, '/api/v1/index')
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toContain('s-maxage=300')
      expect(response.headers.get('x-request-id')).toBeTruthy()

      const body = (await response.json()) as {
        version: number
        players: Array<[string, string, string, string, number]>
        stats: { players: number; linked: number; unresolved: number }
      }

      expect(body.version).toBe(1)
      expect(body.players).toHaveLength(2)
      expect(body.players.map((row) => row[0])).not.toContain('seed-player-3')
      expect(body.stats.unresolved).toBe(1)

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

  it('serves aggregate stats and status', async () => {
    await withApp(async (app) => {
      const stats = await request(app, '/api/v1/stats')
      expect(stats.status).toBe(200)
      const statsBody = (await stats.json()) as {
        totals: { players: number; banned: number }
        coverage: { linked: number; unresolved: number }
        regions: Record<string, { players: number }>
      }
      expect(statsBody.totals.players).toBe(3)
      expect(statsBody.totals.banned).toBe(1)
      expect(statsBody.coverage.unresolved).toBe(1)
      expect(statsBody.regions.eu?.players).toBe(3)

      const status = await request(app, '/api/v1/status')
      expect(status.status).toBe(200)
      expect(status.headers.get('cache-control')).toBe('no-store')
      const statusBody = (await status.json()) as {
        ok: boolean
        latestRun: { id: number } | null
        anonymous: { unresolved: number }
      }
      expect(statusBody.ok).toBe(true)
      expect(statusBody.latestRun?.id).toBe(1)
      expect(statusBody.anonymous.unresolved).toBe(1)
    })
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

  it('protects admin actions with a token', async () => {
    let resolved = 0

    await withApp(
      async (app) => {
        const unauthorized = await request(app, '/api/v1/admin/anon', { method: 'POST' })
        expect(unauthorized.status).toBe(401)

        const resolvedResponse = await request(app, '/api/v1/admin/anon', {
          method: 'POST',
          headers: { 'x-admin-token': 'secret' },
        })
        expect(resolvedResponse.status).toBe(200)
        expect(resolved).toBe(1)

        const unknown = await request(app, '/api/v1/admin/other', {
          method: 'POST',
          headers: { 'x-admin-token': 'secret' },
        })
        expect(unknown.status).toBe(404)
      },
      {
        admin: {
          token: 'secret',
          scan: async () => ({ ok: true }),
          resolve: async () => {
            resolved += 1
            return { ok: true }
          },
        },
      },
    )
  })

  it('rejects malformed queries at the database boundary', async () => {
    await withApp(async (app) => {
      const response = await request(app, '/api/v1/players/%3Cscript%3E')
      expect(response.status).toBe(400)
    })
  })
})
