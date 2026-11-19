export const MINUTE_MS = 60_000
export const HOUR_MS = 3_600_000

const budgetResetMinutes = 5

export type IdentityOutcome =
  | { readonly kind: 'skipped' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ran'; readonly tried: number; readonly budgetRemaining: number }

export const scanDelayMs = (options: {
  readonly latestSuccessfulAt: number | null
  readonly now: number
  readonly intervalHours: number
}): number => {
  if (options.latestSuccessfulAt === null) return 0

  const due = options.latestSuccessfulAt + options.intervalHours * HOUR_MS
  return Math.max(0, due - options.now)
}

export const nextBudgetResetAt = (now: number): number => {
  const date = new Date(now)
  const today = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0,
    budgetResetMinutes,
  )

  return today > now
    ? today
    : Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + 1,
        0,
        budgetResetMinutes,
      )
}

export const identityDelay = (options: {
  readonly outcome: IdentityOutcome
  readonly now: number
  readonly activeMinutes: number
  readonly idleMinutes: number
}): { readonly delayMs: number; readonly reason: string } => {
  const { outcome } = options

  if (outcome.kind === 'skipped') {
    return { delayMs: MINUTE_MS, reason: 'scan running; identity pass skipped' }
  }

  if (outcome.kind === 'failed') {
    return { delayMs: options.idleMinutes * MINUTE_MS, reason: 'identity pass failed' }
  }

  if (outcome.budgetRemaining <= 0) {
    return {
      delayMs: Math.max(MINUTE_MS, nextBudgetResetAt(options.now) - options.now),
      reason: 'daily Riot budget exhausted',
    }
  }

  return outcome.tried > 0
    ? { delayMs: options.activeMinutes * MINUTE_MS, reason: 'work was tried' }
    : { delayMs: options.idleMinutes * MINUTE_MS, reason: 'no candidates' }
}
