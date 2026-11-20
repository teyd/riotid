import { describe, expect, it } from 'vite-plus/test'

import { getRateLimit, trackRateLimit } from './rate-limit.ts'

const quota = (limit: number, remaining: number, reset = 30) =>
  new Headers({
    'ratelimit-limit': String(limit),
    'ratelimit-remaining': String(remaining),
    'ratelimit-reset': String(reset),
  })

describe('rate limit meter', () => {
  it('tracks the tightest live bucket and expires it with its window', () => {
    expect(getRateLimit()).toBeNull()

    trackRateLimit('status', new Headers())
    expect(getRateLimit()).toBeNull()

    trackRateLimit('search', quota(120, 90))
    expect(getRateLimit()).toMatchObject({ limit: 120, remaining: 90 })
    expect(getRateLimit()?.resetAt).toBeGreaterThan(Date.now() + 25_000)

    trackRateLimit('browse', quota(120, 20))
    expect(getRateLimit()).toMatchObject({ limit: 120, remaining: 20 })

    trackRateLimit('overview', quota(60, 50))
    expect(getRateLimit()).toMatchObject({ limit: 120, remaining: 20 })

    trackRateLimit('browse', quota(120, 100))
    expect(getRateLimit()).toMatchObject({ limit: 120, remaining: 90 })

    trackRateLimit('search', quota(120, 0, 0))
    expect(getRateLimit()).toMatchObject({ limit: 120, remaining: 100 })

    trackRateLimit('browse', quota(120, 0, 0))
    trackRateLimit('overview', quota(60, 0, 0))
    expect(getRateLimit()).toBeNull()

    trackRateLimit('index', quota(30, 45))
    expect(getRateLimit()).toMatchObject({ limit: 30, remaining: 30 })
  })
})
