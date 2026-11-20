import type {
  PlayerDetail,
  PlayerSearch,
  SearchMatch,
  SearchPlayer,
  ServiceStatus,
  SiteIndex,
} from '@riotid/contracts'

export type { PlayerDetail, PlayerSearch, SearchMatch, SearchPlayer, ServiceStatus, SiteIndex }

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

export type PlayerListItem = {
  readonly puuid: string
  readonly name: string
  readonly tag: string
  readonly region: Region | null
  readonly cardId: string | null
  readonly nameChanges: number
  readonly regionChanges: number
  readonly firstSeenAt: number
  readonly lastSeenAt: number
  readonly former: {
    readonly name: string
    readonly tag: string
    readonly endedAt: number
  } | null
}

export type PlayerPreview = Pick<
  PlayerListItem,
  'puuid' | 'name' | 'tag' | 'region' | 'firstSeenAt' | 'lastSeenAt'
>

export type PlayerSection = {
  readonly id: string
  readonly label: string
  readonly total: number
  readonly truncated: boolean
  readonly players: ReadonlyArray<PlayerListItem>
}

export const indexRowToPlayer = (row: IndexRow, cards: ReadonlyArray<string>): PlayerListItem => {
  const cardIndex = row[P.cardId]
  return {
    puuid: row[P.puuid],
    name: row[P.name],
    tag: row[P.tag],
    region: row[P.region],
    cardId: cardIndex === null ? null : (cards[cardIndex] ?? null),
    nameChanges: row[P.nameChanges],
    regionChanges: row[P.regionChanges],
    firstSeenAt: row[P.firstSeenAt],
    lastSeenAt: row[P.lastSeenAt],
    former: null,
  }
}

export const searchPlayerToItem = (player: SearchPlayer): PlayerListItem => ({
  puuid: player.puuid,
  name: player.name,
  tag: player.tag,
  region: player.region,
  cardId: player.cardId,
  nameChanges: player.nameChanges,
  regionChanges: player.regionChanges,
  firstSeenAt: player.firstSeenAt,
  lastSeenAt: player.lastSeenAt,
  former: null,
})

export const searchMatchToItem = (match: SearchMatch): PlayerListItem => ({
  ...searchPlayerToItem(match.player),
  former: {
    name: match.name,
    tag: match.tag,
    endedAt: match.endedAt,
  },
})

export const toPlayerPreview = (player: PlayerListItem): PlayerPreview => ({
  puuid: player.puuid,
  name: player.name,
  tag: player.tag,
  region: player.region,
  firstSeenAt: player.firstSeenAt,
  lastSeenAt: player.lastSeenAt,
})

export const searchToSections = (result: PlayerSearch): PlayerSection[] =>
  [
    {
      id: 'current',
      label: 'Current names',
      total: result.current.total,
      truncated: result.current.truncated,
      players: result.current.players.map(searchPlayerToItem),
    },
    {
      id: 'past',
      label: 'Past names',
      total: result.past.total,
      truncated: result.past.truncated,
      players: result.past.matches.map(searchMatchToItem),
    },
  ].filter((section) => section.players.length > 0)

export const searchTotal = (result: PlayerSearch): number =>
  result.current.total + result.past.total

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

const scanTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export const formatScanTime = (value: number | null): string =>
  value ? scanTimeFormat.format(value) : '—'

const formatMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

export const formatScanCountdown = (target: number | null, now: number): string => {
  if (!target) return ''

  const minutes = Math.ceil((target - now) / 60_000)
  return minutes > 0 ? `in ${formatMinutes(minutes)}` : 'due now'
}

export const formatDate = (value: number | null): string => {
  if (!value) return '—'
  return new Date(value).toISOString().slice(0, 10)
}

export const formatDateTime = (value: number | null): string => {
  if (!value) return '—'
  return new Date(value).toISOString().replace('T', ' ').slice(0, 16)
}

export const displayName = (player: Pick<PlayerListItem, 'name' | 'tag'>): string => {
  if (!player.name && !player.tag) return 'Anonymous'
  return player.tag ? `${player.name}#${player.tag}` : player.name
}

const fetchJson = async <A>(path: string): Promise<A> => {
  const response = await fetch(path, { headers: { accept: 'application/json' } })

  if (!response.ok) {
    throw new Error(`API ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<A>
}

export const fetchIndex = () => fetchJson<SiteIndex>('/api/v1/index')
export const fetchStatus = () => fetchJson<ServiceStatus>('/api/v1/status')
export const fetchPlayer = (puuid: string) =>
  fetchJson<PlayerDetail>(`/api/v1/players/${encodeURIComponent(puuid)}`)
export const fetchSearch = (query: string, region?: Region | null) => {
  const params = new URLSearchParams({ q: query })
  if (region) params.set('region', region)
  return fetchJson<PlayerSearch>(`/api/v1/search?${params.toString()}`)
}
