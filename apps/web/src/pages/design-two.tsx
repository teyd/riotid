import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import {
  cardAccent,
  cardArt,
  displayName,
  fetchIndex,
  fetchPlayer,
  FLAG,
  formatDate,
  formatDateTime,
  formatRelative,
  P,
  regionLabel,
  regionShort,
  trackerProfileUrl,
  vtlProfileUrl,
  type IndexRow,
  type PlayerDetail,
  type SiteIndex,
} from '../lib/api.ts'

const regions = [
  { value: 'all', label: 'All' },
  { value: 'na', label: 'NA' },
  { value: 'eu', label: 'EU' },
  { value: 'ap', label: 'AP' },
  { value: 'kr', label: 'KR' },
] as const

type RegionFilter = (typeof regions)[number]['value']

const rowHeight = 44

const confidencePercent = (value: number): string => `${(value / 100).toFixed(2)}%`

const matchUrl = (matchId: string | null): string | null =>
  matchId ? `https://vtl.lol/match/${matchId}` : null

const runNote = (started: number | null, ended: number | null): string | null => {
  if (started === null && ended === null) return null
  return `run ${started ?? '—'} → ${ended ?? '—'}`
}

const methodNote = (method: PlayerDetail['links'][number]['method']): string | null => {
  switch (method) {
    case 'match_graph':
      return 'Rank, rating, wins, and tier matched exactly. The match supplies the identity.'
    case 'direct_puuid':
      return 'The anonymized leaderboard row still carried a puuid.'
    case 'mmr_fingerprint':
      return null
    default: {
      const unreachable: never = method
      return unreachable
    }
  }
}

const resolveCardId = (
  row: IndexRow | null,
  cards: ReadonlyArray<string>,
  detailCard: string | null | undefined,
): string | null => {
  if (detailCard) return detailCard
  if (!row) return null
  const index = row[P.cardId]
  if (index === null) return null
  return cards[index] ?? null
}

function CardSwatch({
  cardId,
  width,
  height,
}: {
  readonly cardId: string | null
  readonly width: number
  readonly height: number
}) {
  const art = cardArt(cardId)

  return (
    <span
      className="relative block shrink-0 overflow-hidden border border-[#2c2c30] bg-[#1a1a1c]"
      style={{ width, height, backgroundColor: cardAccent(cardId) }}
    >
      {art ? (
        <img
          src={art}
          alt=""
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          className="h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none'
          }}
        />
      ) : null}
    </span>
  )
}

function Block({
  title,
  count,
  children,
}: {
  readonly title: string
  readonly count: number | null
  readonly children: ReactNode
}) {
  return (
    <section className="border-t border-[#2c2c30] px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-[#8a8a84]">{title}</h2>
        {count === null ? null : (
          <span className="text-[10px] text-[#8a8a84] tabular-nums">{count}</span>
        )}
      </div>
      {children}
    </section>
  )
}

function LogTable({
  rows,
}: {
  readonly rows: ReadonlyArray<{
    readonly key: string
    readonly current: boolean
    readonly from: string
    readonly to: string
    readonly value: string
    readonly note: string | null
  }>
}) {
  if (rows.length === 0) return <p className="text-[12px] text-[#8a8a84]">none</p>

  return (
    <table className="w-full border-collapse text-left text-[12px]">
      <thead>
        <tr className="text-[10px] uppercase tracking-[0.14em] text-[#6f6f68]">
          <th className="w-3 py-1 font-normal" />
          <th className="py-1 pr-3 font-normal">from</th>
          <th className="py-1 pr-3 font-normal">to</th>
          <th className="py-1 font-normal">value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="align-top">
            <td className="py-1 text-[#d7a441]">{row.current ? '>' : ''}</td>
            <td className="py-1 pr-3 text-[#a3a39c] tabular-nums">{row.from}</td>
            <td
              className={`py-1 pr-3 tabular-nums ${row.current ? 'text-[#d7a441]' : 'text-[#a3a39c]'}`}
            >
              {row.to}
            </td>
            <td className="py-1 text-[#e6e4de]">
              <span className="break-all">{row.value}</span>
              {row.note ? (
                <span className="mt-0.5 block text-[10px] text-[#8a8a84]">{row.note}</span>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Evidence({
  link,
  index,
}: {
  readonly link: PlayerDetail['links'][number]
  readonly index: number
}) {
  const anonymous = link.anonymous
  const art = cardArt(anonymous.cardId)
  const url = matchUrl(link.matchId)
  const note = methodNote(link.method)
  const act = anonymous.seasonName ?? anonymous.seasonId

  return (
    <article className="border-t border-[#2c2c30] py-3 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[12px] text-[#e6e4de]">
          <span className="mr-2 text-[#6f6f68] tabular-nums">
            {String(index + 1).padStart(2, '0')}
          </span>
          {link.method}
        </p>
        <p className="shrink-0 text-[11px] text-[#d7a441] tabular-nums">
          {confidencePercent(link.confidence)}
        </p>
      </div>
      {note ? <p className="mt-1 max-w-2xl text-[11px] leading-5 text-[#8a8a84]">{note}</p> : null}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {(
          [
            ['rank', anonymous.leaderboardRank],
            ['rr', anonymous.rankedRating],
            ['wins', anonymous.numberOfWins],
            ['tier', anonymous.competitiveTier],
            ['region', regionLabel(anonymous.region)],
            ['act', act],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[10px] uppercase tracking-[0.16em] text-[#6f6f68]">{label}</dt>
            <dd className="mt-1 truncate text-[12px] text-[#e6e4de] tabular-nums">{value}</dd>
          </div>
        ))}
        <div>
          <dt className="text-[10px] uppercase tracking-[0.16em] text-[#6f6f68]">card</dt>
          <dd className="mt-1">
            {art ? (
              <a
                href={art}
                target="_blank"
                rel="noreferrer noopener"
                className="block h-9 w-7 overflow-hidden border border-[#2c2c30]"
                style={{ backgroundColor: cardAccent(anonymous.cardId) }}
              >
                <img
                  src={art}
                  alt=""
                  width={28}
                  height={36}
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  className="h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none'
                  }}
                />
              </a>
            ) : (
              <span className="text-[12px] text-[#8a8a84]">—</span>
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-3 break-all text-[11px]">
        <span className="text-[#6f6f68]">match </span>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[#d7a441] underline decoration-[#d7a441]/35 underline-offset-2 hover:decoration-[#d7a441]"
          >
            {url}
          </a>
        ) : (
          <span className="text-[#8a8a84]">—</span>
        )}
      </p>
      {anonymous.titleId ? (
        <p className="mt-1 break-all text-[11px] text-[#8a8a84]">title {anonymous.titleId}</p>
      ) : null}
      <p className="mt-1 text-[11px] text-[#8a8a84] tabular-nums">
        linked {formatDateTime(link.createdAt)}
        {anonymous.seasonName ? ` · ${anonymous.seasonId}` : ''}
      </p>
    </article>
  )
}

function Roster({
  rows,
  cards,
  selected,
  onSelect,
  onPrefetch,
}: {
  readonly rows: ReadonlyArray<IndexRow>
  readonly cards: ReadonlyArray<string>
  readonly selected: string | null
  readonly onSelect: (puuid: string) => void
  readonly onPrefetch: (puuid: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    getItemKey: (index) => rows[index]?.[P.puuid] ?? index,
  })
  const selectedIndex = selected ? rows.findIndex((row) => row[P.puuid] === selected) : -1

  useEffect(() => {
    if (selectedIndex >= 0) virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
  }, [selectedIndex, virtualizer])

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index]
          if (!row) return null
          const puuid = row[P.puuid]
          const active = puuid === selected
          const cardIndex = row[P.cardId]
          const cardId = cardIndex === null ? null : (cards[cardIndex] ?? null)
          const name = row[P.name]
          const tag = row[P.tag]

          return (
            <button
              key={item.key}
              type="button"
              role="option"
              aria-selected={active}
              title={`${displayName(row)} ${puuid}`}
              onClick={() => onSelect(puuid)}
              onMouseEnter={() => onPrefetch(puuid)}
              onFocus={() => onPrefetch(puuid)}
              className={`absolute top-0 left-0 flex h-11 w-full items-center gap-2 border-b border-[#2c2c30] pr-2 pl-2 text-left focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-[#d7a441] ${active ? 'bg-[#d7a441]/[0.07]' : 'hover:bg-white/[0.03]'}`}
              style={{
                transform: `translateY(${item.start}px)`,
                boxShadow: active ? 'inset 2px 0 0 #d7a441' : undefined,
              }}
            >
              <CardSwatch cardId={cardId} width={24} height={32} />
              <span className="min-w-0 flex-1 truncate text-[12px]">
                <span className={active ? 'text-[#f3f1ea]' : 'text-[#d9d7d0]'}>
                  {name || 'Anonymous'}
                </span>
                {tag ? <span className="text-[#8a8a84]">#{tag}</span> : null}
              </span>
              <span className="w-7 shrink-0 text-right text-[10px] text-[#a3a39c]">
                {regionShort(row[P.region])}
              </span>
              <span className="w-12 shrink-0 text-right text-[11px] tabular-nums">
                <span className={row[P.nameChanges] > 0 ? 'text-[#d7a441]' : 'text-[#8a8a84]'}>
                  {row[P.nameChanges]}
                </span>
                <span className="text-[#5c5c56]">/</span>
                <span className={row[P.regionChanges] > 0 ? 'text-[#d7a441]' : 'text-[#8a8a84]'}>
                  {row[P.regionChanges]}
                </span>
              </span>
              <span className="w-12 shrink-0 text-right text-[10px] text-[#8a8a84] tabular-nums">
                {formatRelative(row[P.lastSeenAt])}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Readout({
  puuid,
  row,
  cards,
  onBack,
}: {
  readonly puuid: string
  readonly row: IndexRow | null
  readonly cards: ReadonlyArray<string>
  readonly onBack: () => void
}) {
  const query = useQuery({
    queryKey: ['player', puuid],
    queryFn: () => fetchPlayer(puuid),
    staleTime: 60_000,
  })
  const loaded = query.data
  const name = loaded ? (loaded.player.name ?? '') : (row?.[P.name] ?? '')
  const tag = loaded ? (loaded.player.tag ?? '') : (row?.[P.tag] ?? '')
  const region = loaded ? loaded.player.region : (row?.[P.region] ?? null)
  const cardId = resolveCardId(row, cards, loaded?.player.cardId)
  const flags = row?.[P.flags] ?? 0
  const tracker = name && tag ? trackerProfileUrl(name, tag) : null
  const vtl = vtlProfileUrl(puuid)
  const names = loaded ? [...loaded.names].reverse() : []
  const regionHistory = loaded ? [...loaded.regions].reverse() : []
  const bans = loaded ? [...loaded.bans].reverse() : []

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <header className="sticky top-0 z-10 border-b border-[#2c2c30] bg-[#101012] px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[#d7a441] lg:hidden"
        >
          [esc] list
        </button>
        <div className="flex items-start gap-3">
          <CardSwatch cardId={cardId} width={36} height={48} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[22px] leading-none font-medium text-[#f3f1ea]">
              {name || 'Anonymous'}
              {tag ? <span className="text-[#d7a441]">#{tag}</span> : null}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.14em]">
              <span className="text-[#a3a39c]">{regionLabel(region)}</span>
              <span className="text-[#6f6f68]">{regionShort(region)}</span>
              {loaded?.player.isBanned ? <span className="text-[#d7a441]">[banned]</span> : null}
              {loaded?.player.isAnonymized || flags & FLAG.anonymized ? (
                <span className="text-[#8a8a84]">[anon]</span>
              ) : null}
              {flags & FLAG.nameChange ? <span className="text-[#8a8a84]">[renamed]</span> : null}
              {flags & FLAG.regionChange ? <span className="text-[#8a8a84]">[moved]</span> : null}
              {flags & FLAG.banHistory ? <span className="text-[#8a8a84]">[ban log]</span> : null}
              {flags & FLAG.unbanHistory ? (
                <span className="text-[#8a8a84]">[unban log]</span>
              ) : null}
            </p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-[11px]">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.16em] text-[#6f6f68]">first</dt>
            <dd className="mt-1 text-[#e6e4de] tabular-nums">
              {formatDate(loaded?.player.firstSeenAt ?? row?.[P.firstSeenAt] ?? null)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.16em] text-[#6f6f68]">last</dt>
            <dd className="mt-1 text-[#e6e4de] tabular-nums">
              {formatRelative(loaded?.player.lastSeenAt ?? row?.[P.lastSeenAt] ?? null)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.16em] text-[#6f6f68]">seen</dt>
            <dd className="mt-1 text-[#e6e4de] tabular-nums">{loaded?.player.timesSeen ?? '—'}</dd>
          </div>
        </dl>
        <div className="mt-3 space-y-1 text-[11px]">
          <p className="flex gap-2">
            <span className="w-8 shrink-0 text-[#6f6f68]">vtl</span>
            <a
              href={vtl}
              target="_blank"
              rel="noreferrer noopener"
              className="min-w-0 break-all text-[#d7a441] underline decoration-[#d7a441]/35 underline-offset-2 hover:decoration-[#d7a441]"
            >
              {vtl}
            </a>
          </p>
          <p className="flex gap-2">
            <span className="w-8 shrink-0 text-[#6f6f68]">trk</span>
            {tracker ? (
              <a
                href={tracker}
                target="_blank"
                rel="noreferrer noopener"
                className="min-w-0 break-all text-[#d7a441] underline decoration-[#d7a441]/35 underline-offset-2 hover:decoration-[#d7a441]"
              >
                {tracker}
              </a>
            ) : (
              <span className="text-[#8a8a84]">—</span>
            )}
          </p>
        </div>
      </header>

      {loaded?.player.isBanned ? (
        <p className="border-b border-[#d7a441]/40 px-4 py-2 text-[11px] text-[#d7a441]">
          banned on the competitive leaderboard. history retained.
        </p>
      ) : null}
      {query.isPending ? (
        <p className="px-4 py-3 text-[10px] uppercase tracking-[0.16em] text-[#8a8a84]">
          <span className="mr-2 inline-block h-2 w-2 bg-[#d7a441] motion-reduce:animate-none animate-pulse" />
          loading history
        </p>
      ) : null}
      {query.isError ? (
        <p className="px-4 py-3 text-[12px] text-[#d7a441]">
          {query.error instanceof Error ? query.error.message : 'player request failed'}
        </p>
      ) : null}

      {loaded ? (
        <>
          <Block title="names" count={loaded.names.length}>
            <LogTable
              rows={names.map((interval, index) => ({
                key: `${interval.startedAt}-${index}`,
                current: interval.endedAt === null,
                from: formatDate(interval.startedAt),
                to: interval.endedAt ? formatDate(interval.endedAt) : 'present',
                value: `${interval.name}#${interval.tag}`,
                note: runNote(interval.startedRunId, interval.endedRunId),
              }))}
            />
          </Block>
          <Block title="regions" count={loaded.regions.length}>
            <LogTable
              rows={regionHistory.map((interval, index) => ({
                key: `${interval.startedAt}-${index}`,
                current: interval.endedAt === null,
                from: formatDate(interval.startedAt),
                to: interval.endedAt ? formatDate(interval.endedAt) : 'present',
                value: `${regionLabel(interval.region)} ${regionShort(interval.region)}`,
                note: runNote(interval.startedRunId, interval.endedRunId),
              }))}
            />
          </Block>
          <Block title="bans" count={loaded.bans.length}>
            <LogTable
              rows={bans.map((interval, index) => ({
                key: `${interval.startedAt}-${index}`,
                current: interval.endedAt === null,
                from: formatDate(interval.startedAt),
                to: interval.endedAt ? formatDate(interval.endedAt) : 'present',
                value: interval.endedAt ? 'banned, then cleared' : 'banned',
                note: [
                  runNote(interval.startedRunId, interval.endedRunId),
                  `seen ${formatDateTime(interval.lastSeenAt)}`,
                ]
                  .filter((part): part is string => part !== null)
                  .join(' · '),
              }))}
            />
          </Block>
          <Block title="counters" count={null}>
            <dl className="grid grid-cols-2 gap-px border border-[#2c2c30] bg-[#2c2c30] sm:grid-cols-4">
              {(
                [
                  ['name', loaded.player.nameChanges],
                  ['region', loaded.player.regionChanges],
                  ['bans', loaded.player.banCount],
                  ['unbans', loaded.player.unbanCount],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="bg-[#101012] px-3 py-2">
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-[#6f6f68]">
                    {label}
                  </dt>
                  <dd className="mt-1 text-lg text-[#f3f1ea] tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </Block>
          <Block title="evidence" count={loaded.links.length}>
            {loaded.links.length === 0 ? (
              <p className="text-[12px] text-[#8a8a84]">none</p>
            ) : (
              loaded.links.map((link, index) => (
                <Evidence
                  key={`${link.matchId ?? 'direct'}-${link.createdAt}-${index}`}
                  link={link}
                  index={index}
                />
              ))
            )}
          </Block>
          <p className="border-t border-[#2c2c30] px-4 py-3 text-[10px] leading-5 break-all text-[#8a8a84] tabular-nums">
            puuid {puuid}
            <br />
            name {formatDateTime(loaded.player.lastNameChangeAt)} · region{' '}
            {formatDateTime(loaded.player.lastRegionChangeAt)} · ban{' '}
            {formatDateTime(loaded.player.lastBanAt)} · unban{' '}
            {formatDateTime(loaded.player.lastUnbanAt)}
            <br />
            runs {loaded.player.firstSeenRunId ?? '—'} → {loaded.player.lastSeenRunId ?? '—'}
          </p>
        </>
      ) : null}
    </div>
  )
}

function Idle({ index }: { readonly index: SiteIndex | undefined }) {
  const stats = index?.stats
  const pairs: Array<[string, string]> = [
    ['players', stats ? stats.players.toLocaleString() : '—'],
    ['names', stats ? stats.nameChanges.toLocaleString() : '—'],
    ['regions', stats ? stats.regionChanges.toLocaleString() : '—'],
    ['bans', stats ? stats.bans.toLocaleString() : '—'],
    ['unbans', stats ? stats.unbans.toLocaleString() : '—'],
    ['linked', stats ? stats.linked.toLocaleString() : '—'],
    ['anon', stats ? stats.anonymous.toLocaleString() : '—'],
    ['open', stats ? stats.unresolved.toLocaleString() : '—'],
    ['last run', formatRelative(stats?.lastRunAt ?? null)],
    ['generated', formatDateTime(index?.generatedAt ?? null)],
    ['season', index?.season?.name ?? '—'],
    ['index', index ? `v${index.version}` : '—'],
  ]

  return (
    <div className="flex min-h-0 flex-1 items-center overflow-y-auto px-6 py-8">
      <div className="w-full max-w-lg border-l border-[#d7a441] pl-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#d7a441]">no target</p>
        <p className="mt-3 text-sm text-[#e6e4de]">Select a player.</p>
        <p className="mt-2 max-w-md text-[12px] leading-5 text-[#8a8a84]">
          j/k or arrows move the lock. / focuses the prompt. esc backs out one level.
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-px border border-[#2c2c30] bg-[#2c2c30] sm:grid-cols-3">
          {pairs.map(([label, value]) => (
            <div key={label} className="bg-[#101012] px-3 py-2">
              <dt className="text-[10px] uppercase tracking-[0.16em] text-[#6f6f68]">{label}</dt>
              <dd className="mt-1 truncate text-[12px] text-[#e6e4de] tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

export function DesignTwoPage() {
  const queryClient = useQueryClient()
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<RegionFilter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const deferredQuery = useDeferredValue(query)
  const index = useQuery({
    queryKey: ['index'],
    queryFn: fetchIndex,
    staleTime: 60_000,
  })

  const cards = index.data?.cards ?? []
  const rows = useMemo(() => {
    const players = index.data?.players ?? []
    const needle = deferredQuery.trim().toLowerCase()
    const filtered: IndexRow[] = []

    for (const row of players) {
      if (region !== 'all' && row[P.region] !== region) continue
      if (needle) {
        const name = row[P.name].toLowerCase()
        const tag = row[P.tag].toLowerCase()
        const blob = `${name}#${tag}`
        if (
          !name.includes(needle) &&
          !tag.includes(needle) &&
          !blob.includes(needle) &&
          !row[P.puuid].toLowerCase().includes(needle)
        ) {
          continue
        }
      }
      filtered.push(row)
    }

    filtered.sort((left, right) => right[P.lastSeenAt] - left[P.lastSeenAt])
    return filtered
  }, [index.data, deferredQuery, region])

  const selectedIndex = selected ? rows.findIndex((row) => row[P.puuid] === selected) : -1
  const selectedRow = useMemo(() => {
    if (!selected) return null
    return index.data?.players.find((row) => row[P.puuid] === selected) ?? null
  }, [index.data, selected])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)

      if (event.key === 'Escape') {
        event.preventDefault()
        if (typing && query) {
          setQuery('')
          return
        }
        if (typing) {
          searchRef.current?.blur()
          return
        }
        if (selected) {
          setSelected(null)
          return
        }
        if (query) setQuery('')
        return
      }

      if (typing) return

      const move = (next: number) => {
        if (rows.length === 0) return
        const bounded = Math.max(0, Math.min(rows.length - 1, next))
        const row = rows[bounded]
        if (!row) return
        event.preventDefault()
        setSelected(row[P.puuid])
      }

      switch (event.key) {
        case '/':
          event.preventDefault()
          searchRef.current?.focus()
          break
        case 'ArrowDown':
        case 'j':
        case 'J':
          move(selectedIndex < 0 ? 0 : selectedIndex + 1)
          break
        case 'ArrowUp':
        case 'k':
        case 'K':
          move(selectedIndex < 0 ? rows.length - 1 : selectedIndex - 1)
          break
        case 'Home':
          move(0)
          break
        case 'End':
          move(rows.length - 1)
          break
        case 'PageDown':
          move(selectedIndex < 0 ? 0 : selectedIndex + 12)
          break
        case 'PageUp':
          move(selectedIndex < 0 ? 0 : selectedIndex - 12)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [query, rows, selected, selectedIndex])

  const prefetch = (puuid: string) => {
    void queryClient.prefetchQuery({
      queryKey: ['player', puuid],
      queryFn: () => fetchPlayer(puuid),
      staleTime: 60_000,
    })
  }

  const total = index.data?.players.length ?? 0
  const status = index.isPending
    ? 'index …'
    : index.isError
      ? index.error instanceof Error
        ? index.error.message
        : 'index fail'
      : `${rows.length.toLocaleString()}/${total.toLocaleString()} ${region === 'all' ? 'all' : region}${query !== deferredQuery ? ' …' : ''}`

  return (
    <div
      className="relative flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-[#070708] font-mono text-[#e6e4de] tabular-nums"
      style={{ fontFamily: "'Commit Mono', ui-monospace, monospace", colorScheme: 'dark' }}
    >
      <div className="relative z-0 flex min-h-0 flex-1 flex-col">
        <div className="h-px shrink-0 bg-[#d7a441]" />
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[#2c2c30] bg-[#101012] px-3 py-2 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="text-[#d7a441]">riotid</span>
            <span className="text-[#5c5c56]">/</span>
            <span className="tracking-[0.18em] text-[#e6e4de] uppercase">history</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] tracking-[0.14em] text-[#8a8a84] uppercase">
            <span>players {index.data?.stats.players.toLocaleString() ?? '—'}</span>
            <span>names {index.data?.stats.nameChanges.toLocaleString() ?? '—'}</span>
            <span className="hidden sm:inline">
              run {formatRelative(index.data?.stats.lastRunAt ?? null)}
            </span>
            <span className="hidden md:inline">{index.data?.season?.name ?? 'no season'}</span>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[22.5rem_minmax(0,1fr)]">
          <section
            aria-label="Players"
            className={`h-full min-h-0 flex-col overflow-hidden border-[#2c2c30] lg:border-r ${selected ? 'hidden lg:flex' : 'flex'}`}
          >
            <div className="shrink-0 space-y-2 border-b border-[#2c2c30] bg-[#101012] px-2 py-2">
              <label className="flex h-9 items-center gap-2 border border-[#2c2c30] bg-[#070708] px-2 focus-within:border-[#d7a441]">
                <span className="text-[#d7a441]" aria-hidden>
                  &gt;
                </span>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="name#tag or puuid"
                  aria-label="Search players"
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-[#e6e4de] caret-[#d7a441] placeholder:text-[#6f6f68] focus:outline-none"
                />
                <kbd className="border border-[#2c2c30] px-1 text-[10px] text-[#8a8a84]">/</kbd>
              </label>
              <div className="flex items-center gap-2">
                <div
                  role="group"
                  aria-label="Region"
                  className="flex min-w-0 flex-1 border border-[#2c2c30]"
                >
                  {regions.map((item, itemIndex) => {
                    const active = region === item.value
                    return (
                      <button
                        key={item.value}
                        type="button"
                        aria-pressed={active}
                        title={item.value === 'all' ? 'All regions' : regionLabel(item.value)}
                        onClick={() => setRegion(item.value)}
                        className={`flex-1 py-1.5 text-[10px] tracking-[0.12em] focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-[#d7a441] ${itemIndex > 0 ? 'border-l border-[#2c2c30]' : ''} ${active ? 'bg-[#d7a441] text-[#1a150c]' : 'text-[#8a8a84] hover:bg-white/[0.03] hover:text-[#e6e4de]'}`}
                      >
                        {item.label}
                      </button>
                    )
                  })}
                </div>
                <span className="w-14 shrink-0 text-right text-[10px] text-[#8a8a84]">
                  {index.isPending ? '—' : rows.length.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 border-b border-[#2c2c30] px-2 py-1 text-[10px] tracking-[0.14em] text-[#6f6f68] uppercase">
              <span className="w-6" />
              <span className="min-w-0 flex-1">name#tag</span>
              <span className="w-7 text-right">rg</span>
              <span className="w-12 text-right" title="name changes / region changes">
                n/r
              </span>
              <span className="w-12 text-right">seen</span>
            </div>
            {index.isPending ? (
              <p className="px-3 py-3 text-[10px] tracking-[0.16em] text-[#8a8a84] uppercase">
                loading index
              </p>
            ) : index.isError ? (
              <p className="px-3 py-3 text-[12px] text-[#d7a441]">{status}</p>
            ) : rows.length === 0 ? (
              <p className="px-3 py-3 text-[12px] text-[#8a8a84]">no match</p>
            ) : (
              <Roster
                rows={rows}
                cards={cards}
                selected={selected}
                onSelect={setSelected}
                onPrefetch={prefetch}
              />
            )}
          </section>

          <section
            aria-label="Player history"
            className={`h-full min-h-0 flex-col overflow-hidden bg-[#101012] ${selected ? 'flex' : 'hidden lg:flex'}`}
          >
            {selected ? (
              <Readout
                puuid={selected}
                row={selectedRow}
                cards={cards}
                onBack={() => setSelected(null)}
              />
            ) : (
              <Idle index={index.data} />
            )}
          </section>
        </div>

        <footer className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-[#2c2c30] bg-[#101012] px-3 text-[10px] tracking-[0.12em] text-[#8a8a84] uppercase">
          <span className={`min-w-0 truncate ${index.isError ? 'text-[#d7a441]' : ''}`}>
            {status}
            <span className="ml-3 text-[#6f6f68]">
              {selectedIndex >= 0 ? `${selectedIndex + 1}` : '—'}
            </span>
          </span>
          <span className="shrink-0 normal-case">
            <span className="text-[#a3a39c]">[j/k]</span> move{' '}
            <span className="text-[#a3a39c]">[/]</span> find{' '}
            <span className="text-[#a3a39c]">[esc]</span> clear
          </span>
        </footer>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          backgroundImage: [
            'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
            'repeating-linear-gradient(to bottom, rgba(0,0,0,0.16) 0px, rgba(0,0,0,0.16) 1px, transparent 1px, transparent 4px)',
          ].join(', '),
          backgroundSize: '28px 28px, 28px 28px, 100% 4px',
        }}
      />
      <span className="sr-only" aria-live="polite">
        {selectedRow ? displayName(selectedRow) : 'no player selected'}
      </span>
    </div>
  )
}
