import { formatDate, type PlayerDetail } from './api.ts'

export type HistoryItem = {
  title: string
  subtitle: string
  detail?: string
  current: boolean
  at: number
}

export const intervalRange = (startedAt: number, endedAt: number | null): string =>
  `${formatDate(startedAt)} → ${endedAt ? formatDate(endedAt) : 'present'}`

const spanDays = (startedAt: number, endedAt: number): string => {
  const days = Math.max(1, Math.round((endedAt - startedAt) / 86_400_000))
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

export const banHistoryItems = (bans: PlayerDetail['bans']): HistoryItem[] =>
  [...bans].reverse().flatMap((interval, index) => {
    const events: HistoryItem[] = []
    if (interval.endedAt !== null) {
      events.push({
        title: 'Unbanned',
        subtitle: formatDate(interval.endedAt),
        detail: `Banned for ${spanDays(interval.startedAt, interval.endedAt)}.`,
        current: index === 0,
        at: interval.endedAt,
      })
    }
    events.push({
      title: 'Banned',
      subtitle: formatDate(interval.startedAt),
      ...(interval.endedAt === null ? { detail: 'Ongoing.' } : {}),
      current: interval.endedAt === null,
      at: interval.startedAt,
    })
    return events
  })
