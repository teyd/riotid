export type RateLimit = {
  readonly scope: string
  readonly limit: number
  readonly remaining: number
  readonly resetAt: number
}

const buckets = new Map<string, RateLimit>()
const listeners = new Set<() => void>()
let snapshot: RateLimit | null = null

const parse = (headers: Headers): Omit<RateLimit, 'scope'> | null => {
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

const recompute = () => {
  const now = Date.now()
  let tightest: RateLimit | null = null

  for (const [scope, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(scope)
      continue
    }

    if (!tightest || bucket.remaining / bucket.limit < tightest.remaining / tightest.limit) {
      tightest = bucket
    }
  }

  if (tightest === snapshot) return

  snapshot = tightest
  for (const listener of listeners) listener()
}

export const trackRateLimit = (scope: string, headers: Headers) => {
  const next = parse(headers)
  if (!next) return

  buckets.set(scope, { ...next, scope })
  recompute()
}

export const getRateLimit = () => snapshot

export const subscribeRateLimit = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
