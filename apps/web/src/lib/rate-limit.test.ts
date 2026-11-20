import { describe, expect, it } from 'vite-plus/test'

import { getRateLimit, rateLimitTone, trackRateLimit } from './rate-limit.ts'

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
    expect(getRateLimit()).toMatchObject({ scope: 'search', limit: 120, remaining: 90 })
    expect(getRateLimit()?.resetAt).toBeGreaterThan(Date.now() + 25_000)

    trackRateLimit('browse', quota(120, 20))
    expect(getRateLimit()).toMatchObject({ scope: 'browse', limit: 120, remaining: 20 })

    trackRateLimit('overview', quota(60, 50))
    expect(getRateLimit()).toMatchObject({ limit: 120, remaining: 20 })

    trackRateLimit('browse', quota(120, 100))
    expect(getRateLimit()).toMatchObject({ scope: 'search', limit: 120, remaining: 90 })

    trackRateLimit('search', quota(120, 0, 0))
    expect(getRateLimit()).toMatchObject({ limit: 120, remaining: 100 })

    trackRateLimit('browse', quota(120, 0, 0))
    trackRateLimit('overview', quota(60, 0, 0))
    expect(getRateLimit()).toBeNull()

    trackRateLimit('index', quota(30, 45))
    expect(getRateLimit()).toMatchObject({ limit: 30, remaining: 30 })
  })

  it('moves from white to yellow, orange and red as the bucket drains', () => {
    expect(rateLimitTone({ remaining: 60, limit: 60 })).toBe('normal')
    expect(rateLimitTone({ remaining: 31, limit: 60 })).toBe('normal')
    expect(rateLimitTone({ remaining: 30, limit: 60 })).toBe('warning')
    expect(rateLimitTone({ remaining: 16, limit: 60 })).toBe('warning')
    expect(rateLimitTone({ remaining: 15, limit: 60 })).toBe('low')
    expect(rateLimitTone({ remaining: 7, limit: 60 })).toBe('low')
    expect(rateLimitTone({ remaining: 6, limit: 60 })).toBe('critical')
    expect(rateLimitTone({ remaining: 0, limit: 60 })).toBe('critical')
  })
})
