import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import ArrowLeftIcon from 'kubai-icons-react/icons/arrow-left'
import SearchIcon from 'kubai-icons-react/icons/search'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import {
  cardAccent,
  cardArt,
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
  type Region,
} from '../lib/api.ts'

type RegionFilter = 'all' | Region

const REGIONS: ReadonlyArray<{ value: RegionFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'na', label: 'NA' },
  { value: 'eu', label: 'EU' },
  { value: 'ap', label: 'AP' },
  { value: 'kr', label: 'KR' },
]

const METHOD_LABEL: Record<PlayerDetail['links'][number]['method'], string> = {
  match_graph: 'Match graph correlation',
  mmr_fingerprint: 'MMR fingerprint match',
  direct_puuid: 'Direct PUUID observation',
}

function CardThumb({ cardId, size = 'sm' }: { cardId: string | null; size?: 'sm' | 'md' }) {
  const art = cardArt(cardId)
  const dims = size === 'md' ? 'h-14 w-11' : 'h-9 w-7'
  const w = size === 'md' ? 44 : 28
  const h = size === 'md' ? 56 : 36

  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-[3px] border border-stone-200/10 ${dims}`}
      style={{ backgroundColor: cardAccent(cardId) }}
    >
      {art ? (
        <img
          src={art}
          alt=""
          width={w}
          height={h}
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

function TimelineEntry({
  primary,
  secondary,
  current,
  accentLabel,
}: {
  primary: string
  secondary: string
  current: boolean
  accentLabel?: string
}) {
  return (
    <div className="group flex items-baseline justify-between gap-6 py-3">
      <div className="flex min-w-0 items-baseline gap-3">
        <span
          aria-hidden="true"
          className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
            current ? 'bg-violet-400' : 'bg-stone-700'
          }`}
        />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium tracking-[-0.01em] text-stone-100">
            {primary}
          </p>
          <p className="mt-1 font-mono text-[11px] text-stone-500">{secondary}</p>
        </div>
      </div>
      {current ? (
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-violet-400">
          {accentLabel ?? 'current'}
        </span>
      ) : null}
    </div>
  )
}

function EvidenceBlock({ link }: { link: PlayerDetail['links'][number] }) {
  const anon = link.anonymous
  const matchUrl = link.matchId ? `https://vtl.lol/match/${link.matchId}` : null
  const cardUrl = `https://media.valorant-api.com/playercards/${anon.cardId}/smallart.png`

  return (
    <div className="border-t border-stone-200/[0.07] py-5 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium text-stone-200">{METHOD_LABEL[link.method]}</p>
        <div className="flex items-center gap-3 font-mono text-[11px] text-stone-400 tabular-nums">
          <span>{(link.confidence / 100).toFixed(2)}% confidence</span>
          <span className="text-stone-600">·</span>
          <span className="text-stone-500">{formatDateTime(link.createdAt)}</span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">rank</dt>
          <dd className="mt-1 font-mono text-[12px] text-stone-200 tabular-nums">
            #{anon.leaderboardRank}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">rr</dt>
          <dd className="mt-1 font-mono text-[12px] text-stone-200 tabular-nums">
            {anon.rankedRating}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">wins</dt>
          <dd className="mt-1 font-mono text-[12px] text-stone-200 tabular-nums">
            {anon.numberOfWins}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">tier</dt>
          <dd className="mt-1 font-mono text-[12px] text-stone-200 tabular-nums">
            {anon.competitiveTier}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">
            region
          </dt>
          <dd className="mt-1 font-mono text-[12px] text-stone-200">{regionShort(anon.region)}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">act</dt>
          <dd className="mt-1 truncate font-mono text-[12px] text-stone-200">
            {anon.seasonName ?? anon.seasonId}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">card</dt>
          <dd className="mt-1 flex items-center gap-2">
            <a
              href={cardUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="block h-7 w-5 overflow-hidden rounded-[2px] border border-stone-200/10"
              style={{ backgroundColor: cardAccent(anon.cardId) }}
              title={anon.cardId}
            >
              <img
                src={cardUrl}
                alt=""
                width={20}
                height={28}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
              />
            </a>
            <span className="truncate font-mono text-[10px] text-stone-500">
              {anon.cardId.slice(0, 8)}
            </span>
          </dd>
        </div>
      </dl>

      {matchUrl ? (
        <div className="mt-4 flex flex-wrap items-baseline gap-2 font-mono text-[11px]">
          <span className="text-stone-500">match</span>
          <a
            href={matchUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="break-all text-violet-400 transition-colors hover:text-violet-300 hover:underline"
          >
            {matchUrl}
          </a>
        </div>
      ) : null}
    </div>
  )
}

function DetailPane({
  puuid,
  row,
  cardId,
  onBack,
}: {
  puuid: string
  row: IndexRow | null
  cardId: string | null
  onBack: () => void
}) {
  const [copied, setCopied] = useState(false)
  const query = useQuery({
    queryKey: ['player', puuid],
    queryFn: () => fetchPlayer(puuid),
    staleTime: 60_000,
  })

  const detail = query.data
  const flags = row?.[P.flags] ?? 0
  const name = detail?.player.name ?? row?.[P.name] ?? ''
  const tag = detail?.player.tag ?? row?.[P.tag] ?? ''
  const region = detail?.player.region ?? row?.[P.region] ?? null
  const resolvedCardId = detail?.player.cardId ?? cardId

  const statusTags: string[] = []
  if (flags & FLAG.anonymized || detail?.player.isAnonymized) statusTags.push('anonymized')
  if (detail?.player.isBanned) statusTags.push('banned')
  if (flags & FLAG.nameChange || (detail?.player.nameChanges ?? 0) > 0) statusTags.push('renamed')
  if (flags & FLAG.regionChange || (detail?.player.regionChanges ?? 0) > 0) {
    statusTags.push('transferred')
  }

  const copyPuuid = async () => {
    await navigator.clipboard.writeText(puuid)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#0c0d10]">
      <header className="sticky top-0 z-10 border-b border-stone-200/[0.08] bg-[#0c0d10] px-6 py-6 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to player list"
              className="-ml-1.5 mt-1 rounded-md p-1.5 text-stone-500 transition-colors hover:bg-stone-200/[0.06] hover:text-stone-200 lg:hidden"
            >
              <ArrowLeftIcon className="size-4" />
            </button>

            <CardThumb cardId={resolvedCardId} size="md" />

            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h1 className="truncate text-2xl font-semibold tracking-[-0.025em] text-stone-50 sm:text-[28px]">
                  {name || 'Anonymous'}
                </h1>
                {tag ? <span className="font-mono text-sm text-stone-500">#{tag}</span> : null}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] text-stone-400">
                <span>{regionLabel(region)}</span>
                {statusTags.map((item) => (
                  <span key={item} className="flex items-center gap-2.5">
                    <span className="text-stone-700">·</span>
                    <span
                      className={
                        item === 'banned'
                          ? 'text-amber-400'
                          : item === 'anonymized'
                            ? 'text-violet-400'
                            : 'text-stone-400'
                      }
                    >
                      {item}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-4 font-mono text-[11px]">
            <a
              href={vtlProfileUrl(puuid)}
              target="_blank"
              rel="noreferrer noopener"
              className="text-stone-400 transition-colors hover:text-violet-400"
            >
              vtl.lol ↗
            </a>
            {name && tag ? (
              <a
                href={trackerProfileUrl(name, tag)}
                target="_blank"
                rel="noreferrer noopener"
                className="text-stone-400 transition-colors hover:text-stone-100"
              >
                tracker.gg ↗
              </a>
            ) : null}
            <button
              type="button"
              onClick={copyPuuid}
              className="text-stone-500 transition-colors hover:text-stone-200"
            >
              {copied ? 'copied' : 'copy puuid'}
            </button>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-3 gap-6 border-t border-stone-200/[0.06] pt-4">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
              first seen
            </dt>
            <dd className="mt-1 font-mono text-[13px] text-stone-200 tabular-nums">
              {formatDate(detail?.player.firstSeenAt ?? row?.[P.firstSeenAt] ?? null)}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
              last seen
            </dt>
            <dd className="mt-1 font-mono text-[13px] text-stone-200 tabular-nums">
              {formatRelative(detail?.player.lastSeenAt ?? row?.[P.lastSeenAt] ?? null)}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
              observations
            </dt>
            <dd className="mt-1 font-mono text-[13px] text-stone-200 tabular-nums">
              {detail?.player.timesSeen.toLocaleString() ?? '—'}
            </dd>
          </div>
        </dl>
      </header>

      {query.isPending ? (
        <div className="flex items-center gap-3 px-8 py-8 font-mono text-xs text-stone-500">
          <span className="size-1.5 animate-pulse rounded-full bg-violet-400" />
          Loading player history
        </div>
      ) : null}

      {query.isError ? (
        <div className="px-8 py-8">
          <p className="text-sm font-medium text-amber-400">Failed to load player details</p>
          <p className="mt-1 font-mono text-xs text-stone-500">{query.error.message}</p>
        </div>
      ) : null}

      {detail ? (
        <div className="divide-y divide-stone-200/[0.07]">
          {detail.player.isBanned ? (
            <div className="bg-amber-500/[0.04] px-6 py-3.5 font-mono text-[11px] text-amber-300/90 sm:px-8">
              Competitive leaderboard ban observed. Historical identity records remain preserved.
            </div>
          ) : null}

          <section className="px-6 py-6 sm:px-8">
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              {[
                ['name changes', detail.player.nameChanges],
                ['region changes', detail.player.regionChanges],
                ['bans', detail.player.banCount],
                ['unbans', detail.player.unbanCount],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
                    {label}
                  </p>
                  <p className="mt-1.5 text-2xl font-semibold tracking-tight text-stone-100 tabular-nums">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="px-6 py-6 sm:px-8">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
                Name history
              </h2>
              <span className="font-mono text-[11px] text-stone-600 tabular-nums">
                {detail.names.length}
              </span>
            </div>
            {detail.names.length === 0 ? (
              <p className="py-2 text-xs text-stone-500">No authoritative name recorded yet.</p>
            ) : (
              <div className="divide-y divide-stone-200/[0.05]">
                {[...detail.names].reverse().map((interval, idx) => (
                  <TimelineEntry
                    key={`${interval.startedAt}-${idx}`}
                    primary={`${interval.name}#${interval.tag}`}
                    secondary={`${formatDate(interval.startedAt)} → ${
                      interval.endedAt ? formatDate(interval.endedAt) : 'present'
                    }`}
                    current={interval.endedAt === null}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="px-6 py-6 sm:px-8">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
                Region history
              </h2>
              <span className="font-mono text-[11px] text-stone-600 tabular-nums">
                {detail.regions.length}
              </span>
            </div>
            {detail.regions.length === 0 ? (
              <p className="py-2 text-xs text-stone-500">No region intervals recorded.</p>
            ) : (
              <div className="divide-y divide-stone-200/[0.05]">
                {[...detail.regions].reverse().map((interval, idx) => (
                  <TimelineEntry
                    key={`${interval.startedAt}-${idx}`}
                    primary={regionLabel(interval.region)}
                    secondary={`${formatDate(interval.startedAt)} → ${
                      interval.endedAt ? formatDate(interval.endedAt) : 'present'
                    } · ${regionShort(interval.region)}`}
                    current={interval.endedAt === null}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="px-6 py-6 sm:px-8">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
                Ban history
              </h2>
              <span className="font-mono text-[11px] text-stone-600 tabular-nums">
                {detail.bans.length}
              </span>
            </div>
            {detail.bans.length === 0 ? (
              <p className="py-2 text-xs text-stone-500">No ban intervals observed.</p>
            ) : (
              <div className="divide-y divide-stone-200/[0.05]">
                {[...detail.bans].reverse().map((interval, idx) => (
                  <TimelineEntry
                    key={`${interval.startedAt}-${idx}`}
                    primary={interval.endedAt ? 'Banned, then unbanned' : 'Active ban'}
                    secondary={`${formatDate(interval.startedAt)} → ${
                      interval.endedAt ? formatDate(interval.endedAt) : 'present'
                    }`}
                    current={interval.endedAt === null}
                    accentLabel="active"
                  />
                ))}
              </div>
            )}
          </section>

          {detail.links.length > 0 ? (
            <section className="px-6 py-6 sm:px-8">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
                  Identity evidence
                </h2>
                <span className="font-mono text-[11px] text-stone-600 tabular-nums">
                  {detail.links.length}
                </span>
              </div>
              <div>
                {detail.links.map((link, idx) => (
                  <EvidenceBlock key={`${link.matchId ?? 'direct'}-${idx}`} link={link} />
                ))}
              </div>
            </section>
          ) : null}

          <footer className="px-6 py-4 font-mono text-[11px] text-stone-600 sm:px-8">
            <span className="break-all">puuid {puuid}</span>
            <span className="mx-2 text-stone-700">·</span>
            <span>last rename {formatDateTime(detail.player.lastNameChangeAt)}</span>
          </footer>
        </div>
      ) : null}
    </div>
  )
}

export function DesignThreePage() {
  const queryClient = useQueryClient()
  const searchRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<RegionFilter>('all')
  const [selectedPuuid, setSelectedPuuid] = useState<string | null>(null)
  const deferredQuery = useDeferredValue(query)

  const indexQuery = useQuery({
    queryKey: ['index'],
    queryFn: fetchIndex,
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  const cards = indexQuery.data?.cards ?? []

  const rows = useMemo(() => {
    const all = indexQuery.data?.players ?? []
    const needle = deferredQuery.trim().toLowerCase()

    const filtered = all.filter((row) => {
      if (region !== 'all' && row[P.region] !== region) return false
      if (!needle) return true
      return (
        row[P.name].toLowerCase().includes(needle) ||
        row[P.tag].toLowerCase().includes(needle) ||
        `${row[P.name]}#${row[P.tag]}`.toLowerCase().includes(needle) ||
        row[P.puuid].toLowerCase().includes(needle)
      )
    })

    return [...filtered].sort(
      (a, b) =>
        (b[P.lastNameChangeAt] ?? 0) - (a[P.lastNameChangeAt] ?? 0) ||
        b[P.nameChanges] - a[P.nameChanges] ||
        b[P.lastSeenAt] - a[P.lastSeenAt],
    )
  }, [indexQuery.data, deferredQuery, region])

  const selectedIndex = useMemo(
    () => (selectedPuuid ? rows.findIndex((row) => row[P.puuid] === selectedPuuid) : -1),
    [rows, selectedPuuid],
  )

  const selectedRow = useMemo(
    () =>
      selectedPuuid
        ? (indexQuery.data?.players.find((row) => row[P.puuid] === selectedPuuid) ?? null)
        : null,
    [indexQuery.data, selectedPuuid],
  )

  const selectedCardIndex = selectedRow?.[P.cardId] ?? null
  const selectedCardId = selectedCardIndex == null ? null : (cards[selectedCardIndex] ?? null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 58,
    overscan: 10,
  })

  useEffect(() => {
    if (selectedIndex >= 0) {
      virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
    }
  }, [selectedIndex, virtualizer])

  const prefetchPlayer = (puuid: string) => {
    void queryClient.prefetchQuery({
      queryKey: ['player', puuid],
      queryFn: () => fetchPlayer(puuid),
      staleTime: 60_000,
    })
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const inInput =
        target !== null &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      if (event.key === 'Escape') {
        if (inInput) {
          if (query) {
            setQuery('')
          } else {
            searchRef.current?.blur()
          }
          return
        }
        if (selectedPuuid) {
          setSelectedPuuid(null)
          return
        }
        if (query) {
          setQuery('')
        }
        return
      }

      if (inInput) return

      if (event.key === '/') {
        event.preventDefault()
        searchRef.current?.focus()
        return
      }

      if (rows.length === 0) return

      const moveTo = (idx: number) => {
        const clamped = Math.max(0, Math.min(rows.length - 1, idx))
        const nextRow = rows[clamped]
        if (nextRow) {
          event.preventDefault()
          setSelectedPuuid(nextRow[P.puuid])
        }
      }

      if (event.key === 'j' || event.key === 'ArrowDown') {
        moveTo(selectedIndex < 0 ? 0 : selectedIndex + 1)
      } else if (event.key === 'k' || event.key === 'ArrowUp') {
        moveTo(selectedIndex < 0 ? rows.length - 1 : selectedIndex - 1)
      } else if (event.key === 'Home') {
        moveTo(0)
      } else if (event.key === 'End') {
        moveTo(rows.length - 1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [rows, selectedIndex, selectedPuuid, query])

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-[#0a0b0e] text-stone-100 antialiased">
      <div className="grid min-h-0 flex-1 lg:grid-cols-[410px_minmax(0,1fr)]">
        {/* Master column */}
        <aside
          className={`min-h-0 flex-col border-r border-stone-200/[0.08] bg-[#0e0f13] ${
            selectedPuuid ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="border-b border-stone-200/[0.08] px-4 pt-4 pb-3.5">
            <label className="flex h-10 items-center gap-2.5 rounded-md border border-stone-200/[0.09] bg-[#0a0b0e] px-3 transition-colors focus-within:border-violet-400/60">
              <SearchIcon className="size-3.5 shrink-0 text-stone-500" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, #tag, or puuid"
                aria-label="Search players"
                spellCheck={false}
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-stone-100 placeholder:text-stone-600 focus:outline-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="font-mono text-[10px] text-stone-500 hover:text-stone-200"
                >
                  clear
                </button>
              ) : (
                <kbd className="hidden rounded border border-stone-200/10 px-1.5 py-0.5 font-mono text-[10px] text-stone-500 sm:inline-block">
                  /
                </kbd>
              )}
            </label>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div
                role="group"
                aria-label="Filter by region"
                className="inline-flex items-center rounded-md border border-stone-200/[0.08] bg-[#0a0b0e] p-0.5"
              >
                {REGIONS.map((item) => {
                  const active = region === item.value
                  return (
                    <button
                      key={item.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setRegion(item.value)}
                      className={`rounded-[4px] px-2.5 py-1 font-mono text-[11px] transition-colors ${
                        active
                          ? 'bg-stone-200/[0.1] text-stone-100'
                          : 'text-stone-500 hover:text-stone-300'
                      }`}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>

              <span className="font-mono text-[11px] text-stone-500 tabular-nums">
                {rows.length.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            {indexQuery.isPending ? (
              <div className="flex items-center gap-3 px-4 py-6 font-mono text-xs text-stone-500">
                <span className="size-1.5 animate-pulse rounded-full bg-violet-400" />
                Loading index
              </div>
            ) : indexQuery.isError ? (
              <div className="px-4 py-6">
                <p className="text-sm text-amber-400">Could not load player index</p>
                <p className="mt-1 font-mono text-xs text-stone-500">{indexQuery.error.message}</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <p className="text-sm text-stone-300">No matching players</p>
                <p className="mt-1 text-xs text-stone-500">
                  Adjust the search query or region filter.
                </p>
              </div>
            ) : (
              <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain">
                <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
                  {virtualizer.getVirtualItems().map((item) => {
                    const row = rows[item.index]
                    if (!row) return null

                    const puuid = row[P.puuid]
                    const active = puuid === selectedPuuid
                    const cardIndex = row[P.cardId]
                    const cardId = cardIndex === null ? null : (cards[cardIndex] ?? null)
                    const nameChanges = row[P.nameChanges]
                    const regionChanges = row[P.regionChanges]

                    return (
                      <button
                        key={puuid}
                        type="button"
                        data-selected={active}
                        onClick={() => setSelectedPuuid(puuid)}
                        onMouseEnter={() => prefetchPlayer(puuid)}
                        onFocus={() => prefetchPlayer(puuid)}
                        className="absolute top-0 left-0 flex h-[58px] w-full items-center gap-3 border-b border-stone-200/[0.05] px-4 text-left transition-colors hover:bg-stone-200/[0.03] focus-visible:bg-stone-200/[0.04] focus-visible:outline-none data-[selected=true]:bg-stone-200/[0.06]"
                        style={{
                          transform: `translateY(${item.start}px)`,
                          boxShadow: active ? 'inset 2px 0 0 #a78bfa' : undefined,
                        }}
                      >
                        <CardThumb cardId={cardId} size="sm" />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-1.5">
                            <span className="truncate text-[14px] font-medium tracking-[-0.01em] text-stone-100">
                              {row[P.name] || 'Anonymous'}
                            </span>
                            {row[P.tag] ? (
                              <span className="shrink-0 font-mono text-[11px] text-stone-500">
                                #{row[P.tag]}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-stone-500">
                            <span>{regionShort(row[P.region])}</span>
                            {nameChanges > 0 ? (
                              <>
                                <span className="text-stone-700">·</span>
                                <span className="tabular-nums">{nameChanges} name</span>
                              </>
                            ) : null}
                            {regionChanges > 0 ? (
                              <>
                                <span className="text-stone-700">·</span>
                                <span className="tabular-nums">{regionChanges} region</span>
                              </>
                            ) : null}
                          </div>
                        </div>

                        <span className="shrink-0 font-mono text-[11px] text-stone-500 tabular-nums">
                          {formatRelative(row[P.lastSeenAt])}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-stone-200/[0.07] px-4 py-2.5 font-mono text-[10px] text-stone-500">
            {indexQuery.data ? (
              <div className="flex items-center justify-between gap-2">
                <span className="truncate tabular-nums">
                  {indexQuery.data.players.length.toLocaleString()} indexed ·{' '}
                  {indexQuery.data.stats.nameChanges.toLocaleString()} renames
                </span>
                <span className="shrink-0 text-stone-600">
                  {formatRelative(indexQuery.data.stats.lastRunAt)}
                </span>
              </div>
            ) : (
              <span>Riot ID index</span>
            )}
          </div>
        </aside>

        {/* Detail column */}
        <main
          className={`min-h-0 flex-col bg-[#0c0d10] ${selectedPuuid ? 'flex' : 'hidden lg:flex'}`}
        >
          {selectedPuuid ? (
            <DetailPane
              puuid={selectedPuuid}
              row={selectedRow}
              cardId={selectedCardId}
              onBack={() => setSelectedPuuid(null)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <div className="max-w-md">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-violet-400">
                  Identity Archive
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em] text-stone-100">
                  Select a player
                </h2>
                <p className="mt-3 text-sm leading-6 text-stone-400">
                  Inspect Riot ID renames, region transfers, ban intervals, and match-graph identity
                  evidence.
                </p>

                {indexQuery.data ? (
                  <dl className="mt-8 grid grid-cols-3 gap-6 border-y border-stone-200/[0.08] py-5">
                    <div>
                      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
                        players
                      </dt>
                      <dd className="mt-1 font-mono text-lg font-medium text-stone-100 tabular-nums">
                        {indexQuery.data.stats.players.toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
                        linked
                      </dt>
                      <dd className="mt-1 font-mono text-lg font-medium text-stone-100 tabular-nums">
                        {indexQuery.data.stats.linked.toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
                        renames
                      </dt>
                      <dd className="mt-1 font-mono text-lg font-medium text-stone-100 tabular-nums">
                        {indexQuery.data.stats.nameChanges.toLocaleString()}
                      </dd>
                    </div>
                  </dl>
                ) : null}

                <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-[11px] text-stone-500">
                  <span>
                    <kbd className="text-stone-300">j</kbd> /{' '}
                    <kbd className="text-stone-300">k</kbd> navigate
                  </span>
                  <span>
                    <kbd className="text-stone-300">/</kbd> search
                  </span>
                  <span>
                    <kbd className="text-stone-300">esc</kbd> clear
                  </span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
