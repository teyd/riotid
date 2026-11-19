import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { parseReauthLocation, refreshSessionIfStale } from './auth.ts'
import {
  cookieHeader,
  loadCookieFile,
  mergeCookieJar,
  parseCookieInput,
  saveCookieFile,
} from './cookies.ts'

describe('cookie input', () => {
  it('parses a browser cookie header', () => {
    const jar = parseCookieInput('ssid=one; csid=two; Path=/; Domain=.riotgames.com; tdid=three')

    expect(jar).toEqual({ ssid: 'one', csid: 'two', tdid: 'three' })
    expect(cookieHeader(jar)).toBe('ssid=one; csid=two; tdid=three')
  })

  it('parses a Playwright-style array', () => {
    const jar = parseCookieInput(
      JSON.stringify([
        { name: 'ssid', value: 'one', domain: '.riotgames.com' },
        { name: 'csid', value: 'two', domain: '.riotgames.com' },
      ]),
    )

    expect(jar).toEqual({ ssid: 'one', csid: 'two' })
  })

  it('parses a cookie file wrapper', () => {
    const jar = parseCookieInput(JSON.stringify({ cookies: { ssid: 'one', clid: 'two' } }))

    expect(jar).toEqual({ ssid: 'one', clid: 'two' })
  })

  it('parses Netscape cookies.txt', () => {
    const jar = parseCookieInput(
      [
        '# Netscape HTTP Cookie File',
        '.riotgames.com\tTRUE\t/\tTRUE\t0\tssid\tone',
        '.riotgames.com\tTRUE\t/\tTRUE\t0\tcsid\ttwo',
      ].join('\n'),
    )

    expect(jar).toEqual({ ssid: 'one', csid: 'two' })
  })
})

describe('cookie merging', () => {
  it('overwrites, adds, and removes empty cookies', () => {
    const jar = mergeCookieJar(
      { ssid: 'old', tdid: 'keep' },
      { ssid: 'new', csid: 'add', tdid: '' },
    )

    expect(jar).toEqual({ ssid: 'new', csid: 'add' })
  })
})

describe('reauth redirect', () => {
  it('extracts tokens from the redirect fragment', () => {
    const tokens = parseReauthLocation(
      'https://playvalorant.com/opt_in#access_token=access&scope=openid&id_token=id&token_type=Bearer&expires_in=3600',
    )

    expect(tokens).toEqual({ accessToken: 'access', idToken: 'id', expiresIn: 3600 })
  })

  it('rejects an expired cookie redirect', () => {
    expect(() =>
      parseReauthLocation(
        'https://authenticate.riotgames.com/login?client_id=play-valorant-web-prod',
      ),
    ).toThrow('Riot cookies are expired')
  })
})

describe('cookie file', () => {
  it('writes a 0600 file and reads it back', async () => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'riotid-cookie-'))
    const path = join(directory, 'cookies.json')

    try {
      await Effect.runPromise(saveCookieFile(path, { ssid: 'one' }, 'paste'))
      const loaded = await Effect.runPromise(loadCookieFile(path))
      const stat = await fs.stat(path)

      expect(loaded?.cookies).toEqual({ ssid: 'one' })
      expect(loaded?.source).toBe('paste')
      expect(stat.mode & 0o777).toBe(0o600)
      expect(await Effect.runPromise(refreshSessionIfStale(path, 60_000))).toBeNull()
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  it('returns null when the file does not exist', async () => {
    const loaded = await Effect.runPromise(loadCookieFile('/tmp/riotid-does-not-exist.json'))

    expect(loaded).toBeNull()
  })
})
