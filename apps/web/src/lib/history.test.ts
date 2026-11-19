import { describe, expect, it } from 'vite-plus/test'

import type { PlayerDetail } from './api.ts'
import { banHistoryItems } from './history.ts'

const day = 86_400_000
const start = Date.UTC(2026, 0, 1)

const interval = (startedAt: number, endedAt: number | null): PlayerDetail['bans'][number] => ({
  startedAt,
  endedAt,
  lastSeenAt: endedAt ?? startedAt,
  startedRunId: null,
  endedRunId: null,
})

describe('ban history', () => {
  it('expands a closed ban into an unban and a ban, newest first', () => {
    const items = banHistoryItems([interval(start, start + 17 * day)])

    expect(items.map((item) => item.title)).toEqual(['Unbanned', 'Banned'])
    expect(items[0]).toMatchObject({
      subtitle: '2026-01-18',
      detail: 'Banned for 17 days.',
      current: true,
    })
    expect(items[1]).toMatchObject({ subtitle: '2026-01-01', current: false })
  })

  it('marks an open ban as the current state', () => {
    expect(banHistoryItems([interval(start, null)])).toEqual([
      {
        title: 'Banned',
        subtitle: '2026-01-01',
        detail: 'Ongoing.',
        current: true,
        at: start,
      },
    ])
  })

  it('only marks the newest event current across several bans', () => {
    const items = banHistoryItems([
      interval(start, start + day),
      interval(start + 10 * day, start + 13 * day),
    ])

    expect(items.map((item) => item.title)).toEqual(['Unbanned', 'Banned', 'Unbanned', 'Banned'])
    expect(items.map((item) => item.current)).toEqual([true, false, false, false])
    expect(items[2]?.detail).toBe('Banned for 1 day.')
  })

  it('keeps an open ban current above earlier closed bans', () => {
    const items = banHistoryItems([
      interval(start, start + 3 * day),
      interval(start + 8 * day, null),
    ])

    expect(items.map((item) => item.title)).toEqual(['Banned', 'Unbanned', 'Banned'])
    expect(items.map((item) => item.current)).toEqual([true, false, false])
  })

  it('shows no events without ban intervals', () => {
    expect(banHistoryItems([])).toEqual([])
  })
})
