import { describe, expect, it } from 'vite-plus/test'

import { getRateLimit, rateLimitTone, trackRateLimit } from './rate-limit.ts'

const quota = (limit: number, remaining: number, reset = 30) =>
  new Headers({
    'ratelimit-limit': String(limit),
    'ratelimit-remaining': String(remaining),
    'ratelimit-reset': String(reset),
  })

describe('rate limit meter', () => {
  it('tracks each scope separately, clamps and ignores bad headers', () => {
    expect(getRateLimit('browse')).toBeNull()

    trackRateLimit('browse', new Headers())
    expect(getRateLimit('browse')).toBeNull()

    trackRateLimit('browse', quota(120, 20))
    trackRateLimit('search', quota(120, 90))
    expect(getRateLimit('browse')).toMatchObject({ limit: 120, remaining: 20 })
    expect(getRateLimit('browse')?.resetAt).toBeGreaterThan(Date.now() + 25_000)
    expect(getRateLimit('search')).toMatchObject({ limit: 120, remaining: 90 })

    trackRateLimit('search', quota(120, 150))
    expect(getRateLimit('search')).toMatchObject({ limit: 120, remaining: 120 })

    trackRateLimit('browse', quota(60, -5))
    expect(getRateLimit('browse')).toMatchObject({ limit: 60, remaining: 0 })
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
