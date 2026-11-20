import { describe, expect, it } from 'vite-plus/test'

import { MINUTE_MS, chooseJob, nextBudgetResetAt, type WorkConfig, type WorkState } from './work.ts'

const at = (iso: string) => Date.parse(iso)
const now = at('2026-01-01T12:00:00Z')

const config: WorkConfig = {
  scanIntervalHours: 6,
  identityActiveMinutes: 15,
  identityIdleMinutes: 30,
  authRefreshMinutes: 45,
  maintenanceDelayMinutes: 10,
  maintenanceIntervalHours: 24,
}

const state = (overrides: Partial<WorkState> = {}): WorkState => ({
  now,
  bootedAt: at('2026-01-01T11:50:00Z'),
  scan: {
    running: false,
    lastAttemptAt: at('2026-01-01T07:00:00Z'),
  },
  identity: {
    last: { at: at('2026-01-01T11:50:00Z'), ok: true, tried: 1 },
    unresolved: 10,
    budgetRemaining: 100,
  },
  auth: {
    lastSuccessAt: at('2026-01-01T11:40:00Z'),
    last: null,
  },
  maintenance: {
    lastSuccessAt: at('2026-01-01T00:00:00Z'),
    last: null,
  },
  ...overrides,
})

describe('work tick policy', () => {
  it('scans immediately when no run exists and pauses everything while a scan runs', () => {
    expect(chooseJob(state({ scan: { running: false, lastAttemptAt: null } }), config)).toEqual({
      job: 'scan',
      reason: 'no completed scan',
    })

    expect(
      chooseJob(
        state({ scan: { running: true, lastAttemptAt: at('2026-01-01T11:00:00Z') } }),
        config,
      ),
    ).toEqual({ job: null, reason: 'scan running' })
  })

  it('waits the scan interval after success and after failure', () => {
    expect(
      chooseJob(
        state({ scan: { running: false, lastAttemptAt: at('2026-01-01T08:00:00Z') } }),
        config,
      ).job,
    ).not.toBe('scan')

    expect(
      chooseJob(
        state({ scan: { running: false, lastAttemptAt: at('2026-01-01T05:00:00Z') } }),
        config,
      ),
    ).toEqual({ job: 'scan', reason: 'scan interval elapsed' })
  })

  it('runs boot maintenance after the delay, then once per interval', () => {
    const bootState = state({
      maintenance: { lastSuccessAt: null, last: null },
      identity: { last: null, unresolved: 10, budgetRemaining: 100 },
      now: at('2026-01-01T11:55:00Z'),
    })
    expect(chooseJob(bootState, config).job).toBe('identity')

    expect(chooseJob({ ...bootState, now: at('2026-01-01T12:01:00Z') }, config)).toEqual({
      job: 'maintenance',
      reason: 'boot maintenance due',
    })

    expect(
      chooseJob(
        state({
          maintenance: { lastSuccessAt: at('2026-01-01T00:01:00Z'), last: null },
          identity: { last: null, unresolved: 10, budgetRemaining: 100 },
        }),
        config,
      ).job,
    ).toBe('identity')
  })

  it('retries a failed backup after ten minutes', () => {
    const failed = state({
      maintenance: {
        lastSuccessAt: at('2025-12-30T00:00:00Z'),
        last: { at: at('2026-01-01T11:55:00Z'), ok: false },
      },
    })
    expect(chooseJob(failed, config).job).not.toBe('maintenance')

    expect(
      chooseJob(
        {
          ...failed,
          now: at('2026-01-01T12:06:00Z'),
          identity: {
            ...failed.identity,
            last: { at: at('2026-01-01T12:05:00Z'), ok: true, tried: 1 },
          },
        },
        config,
      ),
    ).toEqual({ job: 'maintenance', reason: 'maintenance interval elapsed' })
  })

  it('uses active and idle identity intervals after a pass', () => {
    const active = state({
      identity: {
        last: { at: at('2026-01-01T11:50:00Z'), ok: true, tried: 4 },
        unresolved: 10,
        budgetRemaining: 100,
      },
    })
    expect(chooseJob(active, config).job).not.toBe('identity')
    expect(chooseJob({ ...active, now: at('2026-01-01T12:06:00Z') }, config).job).toBe('identity')

    const idle = state({
      identity: {
        last: { at: at('2026-01-01T11:50:00Z'), ok: true, tried: 0 },
        unresolved: 10,
        budgetRemaining: 100,
      },
    })
    expect(chooseJob(idle, config).job).not.toBe('identity')
    expect(chooseJob({ ...idle, now: at('2026-01-01T12:21:00Z') }, config).job).toBe('identity')
  })

  it('waits the idle interval after a failed identity pass', () => {
    const failed = state({
      identity: {
        last: { at: at('2026-01-01T11:50:00Z'), ok: false, tried: 0 },
        unresolved: 10,
        budgetRemaining: 100,
      },
    })
    expect(chooseJob(failed, config).job).not.toBe('identity')
    expect(chooseJob({ ...failed, now: at('2026-01-01T12:21:00Z') }, config).job).toBe('identity')
  })

  it('stops identity work for the day when the Riot budget is gone', () => {
    const spent = state({
      now: at('2026-01-01T23:00:00Z'),
      scan: { running: false, lastAttemptAt: at('2026-01-01T22:00:00Z') },
      identity: {
        last: { at: at('2026-01-01T22:45:00Z'), ok: true, tried: 4 },
        unresolved: 10,
        budgetRemaining: 0,
      },
      maintenance: { lastSuccessAt: at('2026-01-01T23:00:00Z'), last: null },
      auth: { lastSuccessAt: at('2026-01-01T23:00:00Z'), last: null },
    })
    expect(chooseJob(spent, config).job).toBeNull()

    expect(
      chooseJob(
        {
          ...spent,
          now: at('2026-01-02T00:06:00Z'),
          scan: { running: false, lastAttemptAt: at('2026-01-01T22:00:00Z') },
          identity: { ...spent.identity, budgetRemaining: 5000 },
          maintenance: { lastSuccessAt: at('2026-01-01T23:00:00Z'), last: null },
        },
        config,
      ).job,
    ).toBe('identity')
  })

  it('targets the next 00:05 UTC budget reset', () => {
    expect(nextBudgetResetAt(at('2026-01-01T12:00:00Z'))).toBe(at('2026-01-02T00:05:00Z'))
    expect(nextBudgetResetAt(at('2026-01-01T00:04:00Z'))).toBe(at('2026-01-01T00:05:00Z'))
    expect(nextBudgetResetAt(at('2026-01-01T00:05:00Z'))).toBe(at('2026-01-02T00:05:00Z'))
  })

  it('skips identity when nothing is unresolved and refreshes auth when idle', () => {
    const idle = state({
      identity: { last: null, unresolved: 0, budgetRemaining: 100 },
      auth: { lastSuccessAt: at('2026-01-01T11:00:00Z'), last: null },
    })
    expect(chooseJob(idle, config)).toEqual({ job: 'auth', reason: 'auth refresh due' })

    expect(
      chooseJob(
        { ...idle, auth: { lastSuccessAt: at('2026-01-01T11:40:00Z'), last: null } },
        config,
      ),
    ).toEqual({ job: null, reason: 'nothing due' })
  })

  it('does not retry a failed auth refresh before the refresh interval', () => {
    const failed = state({
      identity: { last: null, unresolved: 0, budgetRemaining: 100 },
      auth: {
        lastSuccessAt: at('2026-01-01T10:00:00Z'),
        last: { at: at('2026-01-01T11:50:00Z'), ok: false },
      },
    })
    expect(chooseJob(failed, config).job).toBeNull()
    expect(chooseJob({ ...failed, now: now + 40 * MINUTE_MS }, config).job).toBe('auth')
  })
})
