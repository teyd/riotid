export type RateLimit = {
  readonly limit: number
  readonly remaining: number
  readonly resetAt: number
}

export type RateLimitTone = 'normal' | 'warning' | 'low' | 'critical'

export const rateLimitTone = ({
  remaining,
  limit,
}: Pick<RateLimit, 'remaining' | 'limit'>): RateLimitTone => {
  const share = remaining / limit
  if (share > 0.5) return 'normal'
  if (share > 0.25) return 'warning'
  if (share > 0.1) return 'low'
  return 'critical'
}

const buckets = new Map<string, RateLimit>()
const listeners = new Set<() => void>()

const parse = (headers: Headers): RateLimit | null => {
  const limitValue = headers.get('ratelimit-limit')
  const remainingValue = headers.get('ratelimit-remaining')
  const resetValue = headers.get('ratelimit-reset')

  if (limitValue === null || remainingValue === null || resetValue === null) return null

  const limit = Number(limitValue)
  const remaining = Number(remainingValue)
  const reset = Number(resetValue)

  if (!Number.isFinite(limit) || limit <= 0) return null
  if (!Number.isFinite(remaining) || !Number.isFinite(reset)) return null

  return {
    limit,
    remaining: Math.max(0, Math.min(limit, remaining)),
    resetAt: Date.now() + Math.max(0, reset) * 1000,
  }
}

export const trackRateLimit = (scope: string, headers: Headers) => {
  const next = parse(headers)
  if (!next) return

  buckets.set(scope, next)
  for (const listener of listeners) listener()
}

export const getRateLimit = (scope: string) => buckets.get(scope) ?? null

export const subscribeRateLimit = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
