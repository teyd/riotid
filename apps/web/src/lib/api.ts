import type {
  CrawlerSnapshot,
  PlayerDetail,
  ServiceStatus,
  SiteIndex,
  SiteStats,
} from '@riotid/contracts'

export type { CrawlerSnapshot, PlayerDetail, ServiceStatus, SiteIndex, SiteStats }

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

export const FLAG = {
  anonymized: 1,
  nameChange: 2,
  regionChange: 4,
  banHistory: 8,
  unbanHistory: 16,
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

export const cardAccent = (cardId: string | null): string => {
  if (!cardId) return 'hsl(160 8% 42%)'

  let hash = 0
  for (const char of cardId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }

  return `hsl(${hash % 360} 62% 56%)`
}

export const cardArt = (cardId: string | null): string | null =>
  cardId ? `https://media.valorant-api.com/playercards/${cardId}/smallart.png` : null

export const cardWideArt = (cardId: string | null): string | null =>
  cardId ? `https://media.valorant-api.com/playercards/${cardId}/wideart.png` : null

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
export const fetchStats = () => fetchJson<SiteStats>('/api/v1/stats')
export const fetchStatus = () => fetchJson<ServiceStatus>('/api/v1/status')
export const fetchCrawler = () => fetchJson<CrawlerSnapshot>('/api/v1/crawler')
