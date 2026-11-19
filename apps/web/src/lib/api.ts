import type { PlayerDetail, SiteIndex } from '@riotid/contracts'

export type { PlayerDetail, SiteIndex }

export const P = {
  puuid: 0,
  name: 1,
  tag: 2,
  region: 3,
  flags: 4,
  nameChanges: 5,
  regionChanges: 6,
  firstSeenAt: 7,
  lastSeenAt: 8,
  cardId: 9,
  lastNameChangeAt: 10,
} as const

export type IndexRow = SiteIndex['players'][number]
export type Region = 'na' | 'eu' | 'ap' | 'kr'

export const regionLabel = (region: string | null): string => {
  switch (region) {
    case 'na':
      return 'Americas'
    case 'eu':
      return 'Europe'
    case 'ap':
      return 'Asia-Pacific'
    case 'kr':
      return 'Korea'
    default:
      return 'Unknown'
  }
}

export const regionShort = (region: string | null): string => region?.toUpperCase() ?? '—'

export const cardArt = (cardId: string | null): string | null =>
  cardId ? `https://media.valorant-api.com/playercards/${cardId}/displayicon.png` : null

export const cardLargeArt = (cardId: string | null): string | null =>
  cardId ? `https://media.valorant-api.com/playercards/${cardId}/largeart.png` : null

export const vtlProfileUrl = (puuid: string): string => `https://vtl.lol/id/${puuid}`

export const playerUrl = (origin: string, puuid: string): string =>
  `${origin}/puuid/${encodeURIComponent(puuid)}`

export const trackerProfileUrl = (name: string, tag: string): string =>
  `https://tracker.gg/valorant/profile/riot/${encodeURIComponent(`${name}#${tag}`)}/overview`

export const formatRelative = (value: number | null): string => {
  if (!value) return 'never'

  const seconds = Math.max(0, Math.round((Date.now() - value) / 1000))

  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`
  if (seconds < 2_592_000) return `${Math.round(seconds / 86_400)}d ago`
  return `${Math.round(seconds / 2_592_000)}mo ago`
}

export const formatDate = (value: number | null): string => {
  if (!value) return '—'
  return new Date(value).toISOString().slice(0, 10)
}

export const formatDateTime = (value: number | null): string => {
  if (!value) return '—'
  return new Date(value).toISOString().replace('T', ' ').slice(0, 16)
}

export const displayName = (row: IndexRow): string => {
  const name = row[P.name]
  const tag = row[P.tag]
  if (!name && !tag) return 'Anonymous'
  return tag ? `${name}#${tag}` : name
}

const fetchJson = async <A>(path: string): Promise<A> => {
  const response = await fetch(path, { headers: { accept: 'application/json' } })

  if (!response.ok) {
    throw new Error(`API ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<A>
}

export const fetchIndex = () => fetchJson<SiteIndex>('/api/v1/index')
export const fetchPlayer = (puuid: string) =>
  fetchJson<PlayerDetail>(`/api/v1/players/${encodeURIComponent(puuid)}`)
