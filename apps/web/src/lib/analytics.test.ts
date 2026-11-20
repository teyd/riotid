import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { trackPageview } from './analytics.ts'

describe('trackPageview', () => {
  const track = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { umami: { track } })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    track.mockReset()
  })

  it('sends one pageview after a burst of navigations', () => {
    trackPageview()
    vi.advanceTimersByTime(700)
    trackPageview()
    vi.advanceTimersByTime(700)
    trackPageview()
    vi.advanceTimersByTime(999)
    expect(track).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(track).toHaveBeenCalledTimes(1)
  })

  it('sends again after a quiet period', () => {
    trackPageview()
    vi.advanceTimersByTime(1000)
    trackPageview()
    vi.advanceTimersByTime(1000)
    expect(track).toHaveBeenCalledTimes(2)
  })

  it('does nothing when Umami is blocked', () => {
    vi.stubGlobal('window', {})
    trackPageview()
    vi.advanceTimersByTime(1000)
    expect(track).not.toHaveBeenCalled()
  })
})
