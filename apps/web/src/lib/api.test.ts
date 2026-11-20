import { describe, expect, it } from 'vite-plus/test'

import type { PlayerSearch } from '@riotid/contracts'

import {
  displayName,
  formatScanCountdown,
  playerUrl,
  searchToSections,
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

describe('player rows', () => {
  it('groups search results and attaches the matched past name', () => {
    const result: PlayerSearch = {
      query: 'old',
      minQueryLength: 3,
      limit: 20,
      current: {
        total: 1,
        truncated: false,
        players: [
          {
            puuid: 'current-player',
            name: 'Current',
            tag: 'ONE',
            region: 'eu',
            cardId: null,
            nameChanges: 1,
            regionChanges: 0,
            firstSeenAt: 10,
            lastSeenAt: 20,
          },
        ],
      },
      past: {
        total: 2,
        truncated: false,
        matches: [
          {
            player: {
              puuid: 'past-player',
              name: 'Now',
              tag: 'TWO',
              region: 'ap',
              cardId: 'card',
              nameChanges: 2,
              regionChanges: 1,
              firstSeenAt: 5,
              lastSeenAt: 30,
            },
            name: 'Old Name',
            tag: 'TWO',
            startedAt: 1,
            endedAt: 4,
          },
        ],
      },
    }

    const sections = searchToSections(result)

    expect(sections.map((section) => section.label)).toEqual(['Current names', 'Past names'])
    expect(sections[0]?.total).toBe(1)
    expect(sections[1]?.total).toBe(2)
    expect(sections[1]?.players[0]).toMatchObject({
      puuid: 'past-player',
      name: 'Now',
      tag: 'TWO',
      former: { name: 'Old Name', tag: 'TWO', endedAt: 4 },
    })
    expect(displayName(sections[1]?.players[0] ?? { name: 'Now', tag: 'TWO' })).toBe('Now#TWO')
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
