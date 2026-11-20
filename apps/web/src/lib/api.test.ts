import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  ApiRequestError,
  fetchPlayer,
  formatScanCountdown,
  isRateLimited,
  playerUrl,
  trackerProfileUrl,
  vtlProfileUrl,
} from './api.ts'

describe('profile links', () => {
  it('encodes a Riot ID for tracker.gg', () => {
    expect(trackerProfileUrl('goombastomper28', 'teyd')).toBe(
      'https://tracker.gg/valorant/profile/riot/goombastomper28%23teyd/overview',
    )
  })

  it('builds a vtl.lol profile from the puuid', () => {
    expect(vtlProfileUrl('00000000-0000-4000-8000-000000000001')).toBe(
      'https://vtl.lol/id/00000000-0000-4000-8000-000000000001',
    )
  })

  it('encodes the puuid in a shareable player URL', () => {
    expect(playerUrl('https://riotid.example', 'a/b c')).toBe(
      'https://riotid.example/puuid/a%2Fb%20c',
    )
  })
})

describe('scan countdown', () => {
  const now = Date.UTC(2026, 10, 19, 21, 0, 0)
  const inMinutes = (minutes: number) => now + minutes * 60_000

  it('counts whole hours and minutes until the next scan', () => {
    expect(formatScanCountdown(inMinutes(360), now)).toBe('in 6h')
    expect(formatScanCountdown(inMinutes(90), now)).toBe('in 1h 30m')
    expect(formatScanCountdown(inMinutes(45), now)).toBe('in 45m')
    expect(formatScanCountdown(inMinutes(0.5), now)).toBe('in 1m')
  })

  it('marks a passed scan time as due', () => {
    expect(formatScanCountdown(inMinutes(0), now)).toBe('due now')
    expect(formatScanCountdown(inMinutes(-30), now)).toBe('due now')
  })

  it('stays empty when no scan is planned', () => {
    expect(formatScanCountdown(null, now)).toBe('')
  })
})

describe('request errors', () => {
  const respond = (status: number, body: unknown, headers: Record<string, string> = {}) => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(body === null ? null : JSON.stringify(body), { status, headers }),
    )
  }

  afterEach(() => vi.unstubAllGlobals())

  it('marks a 429 as rate limited and keeps the retry delay', async () => {
    respond(
      429,
      { error: { code: 'rate_limited', message: 'Too many requests.', requestId: 'req-1' } },
      { 'Retry-After': '60' },
    )

    const error = await fetchPlayer('puuid').catch((error: unknown) => error)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({
      status: 429,
      retryAfter: 60,
      message: 'Too many requests.',
    })
    expect(isRateLimited(error)).toBe(true)
  })

  it('reads a Retry-After date', async () => {
    respond(429, null, { 'Retry-After': new Date(Date.now() + 30_000).toUTCString() })

    const error = await fetchPlayer('puuid').catch((error: unknown) => error)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect((error as ApiRequestError).retryAfter).toBeGreaterThanOrEqual(28)
    expect((error as ApiRequestError).retryAfter).toBeLessThanOrEqual(30)
  })

  it('keeps other failures out of the rate limit path', async () => {
    respond(404, { error: { code: 'not_found', message: 'Player not found.', requestId: 'r' } })

    const error = await fetchPlayer('puuid').catch((error: unknown) => error)

    expect(error).toMatchObject({ status: 404, message: 'Player not found.' })
    expect(isRateLimited(error)).toBe(false)
  })
})
