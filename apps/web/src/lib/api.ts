import type {
  ApiError,
  PlayerDetail,
  PlayerPage,
  PlayerSearch,
  PlayerSort,
  SearchMatch,
  SearchPlayer,
  ServiceStatus,
  SiteOverview,
} from '@riotid/contracts'

export type {
  PlayerDetail,
  PlayerPage,
  PlayerSearch,
  PlayerSort,
  SearchMatch,
  SearchPlayer,
  ServiceStatus,
  SiteOverview,
}

export class ApiRequestError extends Error {
  readonly status: number
  readonly retryAfter: number | null

  constructor(status: number, message: string, retryAfter: number | null) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.retryAfter = retryAfter
  }
}

export const isRateLimited = (error: unknown): error is ApiRequestError =>
  error instanceof ApiRequestError && error.status === 429

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

const parseRetryAfter = (value: string | null): number | null => {
  if (!value) return null

  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds))

  const at = Date.parse(value)
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - Date.now()) / 1000))
}

const fetchJson = async <A>(path: string, signal?: AbortSignal): Promise<A> => {
  const response = await fetch(path, {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null
    throw new ApiRequestError(
      response.status,
      body?.error.message ?? `API ${response.status} ${response.statusText}`,
      parseRetryAfter(response.headers.get('retry-after')),
    )
  }

  return response.json() as Promise<A>
}

export const fetchOverview = (signal?: AbortSignal) =>
  fetchJson<SiteOverview>('/api/v1/overview', signal)
export const fetchStatus = () => fetchJson<ServiceStatus>('/api/v1/status')
export const fetchPlayer = (puuid: string, signal?: AbortSignal) =>
  fetchJson<PlayerDetail>(`/api/v1/players/${encodeURIComponent(puuid)}`, signal)
export const fetchPlayersPage = (
  options: {
    sort: PlayerSort
    region?: Region | null
    cursor?: string | null
    limit?: number
  },
  signal?: AbortSignal,
) => {
  const params = new URLSearchParams({ sort: options.sort })
  if (options.region) params.set('region', options.region)
  if (options.cursor) params.set('cursor', options.cursor)
  if (options.limit) params.set('limit', String(options.limit))
  return fetchJson<PlayerPage>(`/api/v1/players?${params.toString()}`, signal)
}
export const fetchSearch = (query: string, region?: Region | null, signal?: AbortSignal) => {
  const params = new URLSearchParams({ q: query })
  if (region) params.set('region', region)
  return fetchJson<PlayerSearch>(`/api/v1/search?${params.toString()}`, signal)
}
