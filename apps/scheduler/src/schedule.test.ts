import { describe, expect, it } from 'vite-plus/test'

import { HOUR_MS, MINUTE_MS, identityDelay, nextBudgetResetAt, scanDelayMs } from './schedule.ts'

const at = (iso: string) => Date.parse(iso)

describe('schedule', () => {
  it('catches up immediately when no successful run exists', () => {
    expect(
      scanDelayMs({ latestSuccessfulAt: null, now: at('2026-01-01T12:00:00Z'), intervalHours: 6 }),
    ).toBe(0)
  })

  it('waits for the remaining interval after a successful run', () => {
    expect(
      scanDelayMs({
        latestSuccessfulAt: at('2026-01-01T06:00:00Z'),
        now: at('2026-01-01T08:00:00Z'),
        intervalHours: 6,
      }),
    ).toBe(4 * HOUR_MS)
  })

  it('does not wait when the last run is already stale', () => {
    expect(
      scanDelayMs({
        latestSuccessfulAt: at('2026-01-01T00:00:00Z'),
        now: at('2026-01-01T12:00:00Z'),
        intervalHours: 6,
      }),
    ).toBe(0)
  })

  it('targets the next 00:05 UTC budget reset', () => {
    expect(nextBudgetResetAt(at('2026-01-01T12:00:00Z'))).toBe(at('2026-01-02T00:05:00Z'))
    expect(nextBudgetResetAt(at('2026-01-01T00:04:00Z'))).toBe(at('2026-01-01T00:05:00Z'))
    expect(nextBudgetResetAt(at('2026-01-01T00:05:00Z'))).toBe(at('2026-01-02T00:05:00Z'))
  })

  it('pauses for a minute when a scan is running', () => {
    expect(
      identityDelay({
        outcome: { kind: 'skipped' },
        now: at('2026-01-01T12:00:00Z'),
        activeMinutes: 15,
        idleMinutes: 30,
      }),
    ).toEqual({ delayMs: MINUTE_MS, reason: 'scan running; identity pass skipped' })
  })

  it('waits the idle interval after a failed pass', () => {
    expect(
      identityDelay({
        outcome: { kind: 'failed' },
        now: at('2026-01-01T12:00:00Z'),
        activeMinutes: 15,
        idleMinutes: 30,
      }),
    ).toEqual({ delayMs: 30 * MINUTE_MS, reason: 'identity pass failed' })
  })

  it('uses active and idle intervals based on work tried', () => {
    const base = {
      now: at('2026-01-01T12:00:00Z'),
      activeMinutes: 15,
      idleMinutes: 30,
    }

    expect(
      identityDelay({
        ...base,
        outcome: { kind: 'ran', tried: 4, budgetRemaining: 100 },
      }),
    ).toEqual({ delayMs: 15 * MINUTE_MS, reason: 'work was tried' })

    expect(
      identityDelay({
        ...base,
        outcome: { kind: 'ran', tried: 0, budgetRemaining: 100 },
      }),
    ).toEqual({ delayMs: 30 * MINUTE_MS, reason: 'no candidates' })
  })

  it('sleeps until the budget reset when the daily budget is exhausted', () => {
    const result = identityDelay({
      outcome: { kind: 'ran', tried: 4, budgetRemaining: 0 },
      now: at('2026-01-01T23:00:00Z'),
      activeMinutes: 15,
      idleMinutes: 30,
    })

    expect(result.reason).toBe('daily Riot budget exhausted')
    expect(result.delayMs).toBe(65 * MINUTE_MS)
  })
})
