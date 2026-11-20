import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@ui-sdk/react/select'
import { Input } from '@ui-sdk/react/input'
import { Meter, MeterIndicator, MeterLabel, MeterTrack, MeterValue } from '@ui-sdk/react/meter'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { Resizable, ResizableHandle, ResizablePanel } from '@ui-sdk/react/resizable'
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from '@ui-sdk/react/segmented-control'
import { useNavigate } from '@tanstack/react-router'
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type SVGProps,
} from 'react'

import { PlayerDetailLoader } from '../components/player-detail-loader.tsx'
import { PlayerList } from '../components/player-list.tsx'
import { EmptyState, LoadError, LoadingState } from '../components/ui.tsx'
import {
  fetchOverview,
  fetchPlayer,
  fetchPlayersPage,
  fetchSearch,
  fetchStatus,
  formatRelative,
  formatScanCountdown,
  formatScanTime,
  isRateLimited,
  searchMatchToItem,
  searchPlayerToItem,
  searchToSections,
  toPlayerPreview,
  type PlayerListItem,
  type PlayerSection,
  type Region,
} from '../lib/api.ts'
import { useDebouncedValue } from '../lib/use-debounced-value.ts'
import { getRateLimit, rateLimitTone, subscribeRateLimit } from '../lib/rate-limit.ts'

type Sort = 'recentChanges' | 'changes' | 'recent' | 'new' | 'name'

let initialSelectionDone = false
let restoreSearchFocus = false
let selectionSource: 'list' | 'search' | null = null
let lastQuery = ''
let lastRegion: 'all' | Region = 'all'
let lastSort: Sort = 'recentChanges'

const playerPageSize = 250

const sorts: Array<{ value: Sort; label: string; trigger: string }> = [
  { value: 'recentChanges', label: 'Recent name changes', trigger: 'renames' },
  { value: 'changes', label: 'Most changes', trigger: 'changes' },
  { value: 'recent', label: 'Recent activity', trigger: 'recent' },
  { value: 'new', label: 'Newest tracked', trigger: 'new' },
  { value: 'name', label: 'Name A–Z', trigger: 'a–z' },
]

const regions: ReadonlyArray<{ value: 'all' | Region; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'na', label: 'NA' },
  { value: 'eu', label: 'EU' },
  { value: 'ap', label: 'AP' },
  { value: 'kr', label: 'KR' },
]

const isRegion = (value: string | null): value is 'all' | Region =>
  value === 'all' || value === 'na' || value === 'eu' || value === 'ap' || value === 'kr'

const SearchIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" strokeLinecap="round" />
  </svg>
)

const meterTones = {
  normal: { bar: 'bg-zinc-100', text: '' },
  warning: { bar: 'bg-yellow-300', text: 'text-yellow-300' },
  low: { bar: 'bg-orange-400', text: 'text-orange-400' },
  critical: { bar: 'bg-red-500', text: 'text-red-400' },
}

const RateLimitMeter = ({ scope, label, now }: { scope: string; label: string; now: number }) => {
  const rate = useSyncExternalStore(subscribeRateLimit, () => getRateLimit(scope))

  if (!rate) {
    return (
      <div className="flex items-center gap-3">
        <span className="shrink-0 tracking-wide">{label}</span>
        <div className="h-1 flex-1 rounded-full bg-white/10" />
        <span className="shrink-0 tabular-nums">—</span>
      </div>
    )
  }

  const current = now < rate.resetAt ? rate : { ...rate, remaining: rate.limit }
  const tone = rateLimitTone(current)

  return (
    <Meter
      value={current.remaining}
      max={current.limit}
      format={(value) => `${value} / ${current.limit} left`}
      getValueLabel={(value) =>
        `${value} of ${current.limit} ${label} API requests left this minute`
      }
      className="flex items-center gap-3"
    >
      <MeterLabel className="shrink-0 tracking-wide">{label}</MeterLabel>
      <MeterTrack className="h-1 flex-1 rounded-full bg-white/10">
        <MeterIndicator
          className={`h-full rounded-full motion-safe:transition-[width,background-color] motion-safe:duration-300 motion-safe:ease-out ${meterTones[tone].bar}`}
        />
      </MeterTrack>
      <MeterValue className={`shrink-0 tabular-nums ${meterTones[tone].text}`} />
    </Meter>
  )
}

const RateLimits = ({ now }: { now: number }) => (
  <div className="grid gap-2 sm:grid-cols-[3fr_2fr] sm:gap-6">
    <RateLimitMeter scope="browse" label="list" now={now} />
    <RateLimitMeter scope="search" label="search" now={now} />
  </div>
)

type ScanStatusProps = {
  players: number | null
  nameChanges: number | null
  lastRunAt: number | null
  nextRunAt: number | null
  cookieUpdatedAt: number | null | undefined
  cookieStaleAfterMs: number | undefined
  error: Error | null
  onRetry: () => void
}

const ScanStatus = ({
  players,
  nameChanges,
  lastRunAt,
  nextRunAt,
  cookieUpdatedAt,
  cookieStaleAfterMs,
  error,
  onRetry,
}: ScanStatusProps) => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const exact = (value: number) => new Date(value).toLocaleString()
  const cookieStale =
    typeof cookieUpdatedAt === 'number' &&
    cookieStaleAfterMs !== undefined &&
    now - cookieUpdatedAt > cookieStaleAfterMs
  const cookieWarning = cookieUpdatedAt === null || cookieStale

  return (
    <footer
      role={error ? 'status' : undefined}
      className="flex shrink-0 flex-col gap-2 border-t border-white/[0.06] px-4 py-2.5 font-mono text-[11px] text-zinc-400"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {error ? (
          <>
            <span className="text-zinc-300">
              {isRateLimited(error)
                ? 'API rate limited (429) — retrying'
                : 'API offline — retrying'}
            </span>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-6 items-center px-1 text-zinc-200 underline decoration-white/30 underline-offset-2 hover:text-white"
            >
              Retry now
            </button>
          </>
        ) : (
          <>
            <span>{players?.toLocaleString() ?? '—'} public players</span>
            <span>{nameChanges?.toLocaleString() ?? '—'} name changes</span>
            <span className={cookieWarning ? 'text-amber-300' : undefined}>
              cookie{' '}
              {typeof cookieUpdatedAt === 'number' ? (
                <>
                  {cookieStale ? 'stale · ' : ''}
                  <time
                    dateTime={new Date(cookieUpdatedAt).toISOString()}
                    title={exact(cookieUpdatedAt)}
                  >
                    {formatRelative(cookieUpdatedAt)}
                  </time>
                </>
              ) : cookieUpdatedAt === null ? (
                'missing'
              ) : (
                '—'
              )}
            </span>
            <span className="sm:ms-auto">
              last scan{' '}
              {lastRunAt ? (
                <time dateTime={new Date(lastRunAt).toISOString()} title={exact(lastRunAt)}>
                  {formatScanTime(lastRunAt)}
                </time>
              ) : (
                'never'
              )}
            </span>
            <span>
              next scan{' '}
              {nextRunAt ? (
                <>
                  <time dateTime={new Date(nextRunAt).toISOString()} title={exact(nextRunAt)}>
                    {formatScanTime(nextRunAt)}
                  </time>{' '}
                  <span>({formatScanCountdown(nextRunAt, now)})</span>
                </>
              ) : (
                '—'
              )}
            </span>
          </>
        )}
      </div>
      <RateLimits now={now} />
    </footer>
  )
}

export function PlayersPage({ selected }: { selected?: string }) {
  const p = selected ?? null
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const searchRef = useRef<HTMLInputElement>(null)
  const loadingMoreRef = useRef(false)
  const [query, setQueryState] = useState(lastQuery)
  const [region, setRegionState] = useState<'all' | Region>(lastRegion)
  const [sort, setSortState] = useState<Sort>(lastSort)
  const [loadingMore, setLoadingMore] = useState(false)
  const deferredQuery = useDeferredValue(query)
  const setQuery = (next: string) => {
    lastQuery = next
    setQueryState(next)
  }
  const setRegion = (next: 'all' | Region) => {
    lastRegion = next
    setRegionState(next)
  }
  const setSort = (next: Sort) => {
    lastSort = next
    setSortState(next)
  }

  useEffect(() => {
    const preload = () => {
      void import('../components/player-detail.tsx')
    }
    if (typeof window.requestIdleCallback === 'function') {
      const idle = window.requestIdleCallback(preload, { timeout: 2500 })
      return () => window.cancelIdleCallback(idle)
    }
    const timer = window.setTimeout(preload, 2500)
    return () => window.clearTimeout(timer)
  }, [])

  const overview = useQuery({
    queryKey: ['overview'],
    queryFn: ({ signal }) => fetchOverview(signal),
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  const browse = useInfiniteQuery({
    queryKey: ['players', sort, region],
    queryFn: ({ pageParam, signal }) =>
      fetchPlayersPage(
        {
          sort,
          region: region === 'all' ? null : region,
          cursor: pageParam,
          limit: playerPageSize,
        },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 60_000,
  })

  const status = useQuery({
    queryKey: ['status'],
    queryFn: fetchStatus,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  })

  const needle = deferredQuery.trim()
  const searchMode = needle.length >= 3
  const requestedQuery = useDebouncedValue(needle, 180)
  const search = useQuery({
    queryKey: ['search', requestedQuery, region],
    queryFn: ({ signal }) => fetchSearch(requestedQuery, region === 'all' ? null : region, signal),
    enabled: searchMode && requestedQuery.length >= 3,
    staleTime: 30_000,
  })
  const searchData =
    searchMode && requestedQuery === needle && search.data?.query === needle ? search.data : null
  const searchFailed = searchMode && !searchData && search.isError
  const typing = needle.length > 0 && !searchMode
  const publicPlayers = overview.data?.stats.publicPlayers ?? 0
  const browseTotal = browse.data?.pages[0]?.total ?? null

  const rows: PlayerListItem[] = useMemo(
    () => browse.data?.pages.flatMap((page) => page.players.map(searchPlayerToItem)) ?? [],
    [browse.data],
  )

  const browseSections: PlayerSection[] = useMemo(
    () => [{ id: 'all', label: '', total: rows.length, truncated: false, players: rows }],
    [rows],
  )

  const searchSections = useMemo(
    () => (searchData ? searchToSections(searchData) : []),
    [searchData],
  )

  const sections = searchFailed ? [] : searchMode ? searchSections : typing ? [] : browseSections

  const searchItems: PlayerListItem[] = useMemo(
    () => [
      ...(searchData?.current.players.map(searchPlayerToItem) ?? []),
      ...(searchData?.past.matches.map(searchMatchToItem) ?? []),
    ],
    [searchData],
  )

  const playersById = useMemo(() => new Map(rows.map((player) => [player.puuid, player])), [rows])

  const selectedRow = p ? (playersById.get(p) ?? null) : null
  const selectedSearchPlayer = p ? (searchItems.find((item) => item.puuid === p) ?? null) : null
  const selectedPlayer = selectedSearchPlayer ?? selectedRow
  const selectedPreview = selectedPlayer ? toPlayerPreview(selectedPlayer) : null
  const selectedCard = selectedPlayer?.cardId ?? null

  useEffect(() => {
    if (p) {
      initialSelectionDone = true
      return
    }
    if (initialSelectionDone || browse.isPending || rows.length === 0) return
    if (searchMode || typing) return
    if (!window.matchMedia('(min-width: 1024px)').matches) return

    const first = rows[0]?.puuid
    if (first) {
      initialSelectionDone = true
      void navigate({ to: '/puuid/$puuid', params: { puuid: first }, replace: true })
    }
  }, [p, browse.isPending, rows, navigate, searchMode, typing])

  useEffect(() => {
    if (!restoreSearchFocus) return
    const frame = window.requestAnimationFrame(() => {
      restoreSearchFocus = false
      searchRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const select = (puuid: string | null, source: 'list' | 'search' = 'list') => {
    if (puuid === p) return
    if (puuid) {
      selectionSource = source
      void navigate({ to: '/puuid/$puuid', params: { puuid }, replace: true })
      return
    }

    void navigate({ to: '/', replace: true })
  }

  const prefetch = (puuid: string) => {
    void queryClient.prefetchQuery({
      queryKey: ['player', puuid],
      queryFn: ({ signal }) => fetchPlayer(puuid, signal),
      staleTime: 60_000,
      retry: false,
    })
  }

  const backToList = () => {
    restoreSearchFocus = true
    select(null)
  }

  const loadMore = () => {
    if (loadingMoreRef.current || !browse.hasNextPage || browse.isFetchNextPageError) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    void browse.fetchNextPage().finally(() => {
      loadingMoreRef.current = false
      setLoadingMore(false)
    })
  }

  const firstResult = searchMode
    ? (searchItems[0]?.puuid ?? null)
    : typing
      ? null
      : (rows[0]?.puuid ?? null)
  const groupCount = (total: number, truncated: boolean, shown: number) =>
    truncated ? `${shown}+` : total.toLocaleString()
  const countLabel = searchMode
    ? searchData
      ? `${groupCount(searchData.current.total, searchData.current.truncated, searchData.current.players.length)} current · ${groupCount(searchData.past.total, searchData.past.truncated, searchData.past.matches.length)} past`
      : '—'
    : typing
      ? '0'
      : browseTotal === null
        ? '—'
        : browseTotal.toLocaleString()
  const browseFailed = !searchMode && !typing && browse.isError && rows.length === 0
  const listLoading = searchMode ? !searchData && !searchFailed : browse.isPending
  const emptyTitle = searchMode
    ? 'No players match.'
    : typing
      ? 'Keep typing…'
      : publicPlayers
        ? 'No players match.'
        : 'No players yet.'
  const emptyHint = searchMode
    ? 'Try a current or past name, tag, or another region.'
    : typing
      ? 'Search current and past names with at least 3 characters.'
      : publicPlayers
        ? 'Try another region.'
        : 'Run a scan to populate the index.'

  const sortOption = sorts.find((item) => item.value === sort) ?? sorts[0]!
  const escape = () => {
    if (p) {
      backToList()
      return
    }
    if (query) {
      setQuery('')
      return
    }
    searchRef.current?.blur()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">Riot ID history</h1>
      <Resizable autoSaveId="riotid:split" className="flex min-h-0 flex-1">
        <ResizablePanel
          id="player-list"
          defaultSize="460px"
          minSize="360px"
          maxSize="760px"
          className={`min-h-0 max-lg:!w-full max-lg:!basis-full ${p ? 'hidden lg:flex' : 'flex'}`}
        >
          <section
            aria-labelledby="player-list-heading"
            className="relative flex h-full w-full min-h-0 flex-col border-r border-white/[0.07]"
          >
            <h2 id="player-list-heading" className="sr-only">
              Player list
            </h2>
            <div className="border-b border-white/[0.08] px-4 pt-4 pb-3">
              <div className="flex h-10 min-w-0 items-center gap-2.5 rounded-md border border-white/20 bg-white/[0.03] px-3 focus-within:bg-white/[0.06]">
                <SearchIcon aria-hidden className="size-4 shrink-0 text-zinc-400" />
                <Input
                  ref={searchRef}
                  value={query}
                  onValueChange={setQuery}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === 'ArrowDown') && firstResult) {
                      event.preventDefault()
                      select(firstResult, 'search')
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      if (query) setQuery('')
                      else searchRef.current?.blur()
                    }
                  }}
                  name="player-search"
                  type="text"
                  inputMode="search"
                  enterKeyHint="search"
                  placeholder="Search current or past names…"
                  aria-label="Search current and past names"
                  spellCheck={false}
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent font-mono text-sm text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
                />
                <kbd
                  aria-hidden
                  className="hidden rounded border border-white/25 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400 sm:block"
                >
                  /
                </kbd>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <SegmentedControl
                  value={region}
                  onValueChange={(next) => {
                    if (isRegion(next)) setRegion(next)
                  }}
                  aria-label="Region"
                  className="relative flex items-center gap-0.5 rounded-md border border-white/20 bg-white/[0.02] p-0.5"
                >
                  <SegmentedControlIndicator className="rounded-[5px] bg-white/[0.08]" />
                  {regions.map((item) => (
                    <SegmentedControlItem
                      key={item.value}
                      value={item.value}
                      className="rounded-[5px] px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400 transition-colors hover:text-zinc-200 focus-visible:outline-white/40 data-[checked]:text-zinc-50"
                    >
                      {item.label}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>

                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
                    {countLabel}
                  </span>
                  {searchMode ? (
                    <span className="font-mono text-[11px] uppercase tracking-wide text-zinc-400">
                      relevance
                    </span>
                  ) : (
                    <Select
                      items={sorts}
                      value={sort}
                      onValueChange={(value) => {
                        if (value) setSort(value as Sort)
                      }}
                    >
                      <SelectLabel className="sr-only">Sort players</SelectLabel>
                      <SelectTrigger
                        aria-label={`Sort players: ${sortOption?.label ?? sort}`}
                        className="flex h-7 items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-zinc-400 hover:text-zinc-100"
                      >
                        <SelectValue>
                          {(state) =>
                            sorts.find((item) => item.value === state.value)?.trigger ??
                            sortOption?.trigger ??
                            sort
                          }
                        </SelectValue>
                        <span aria-hidden className="text-[11px] leading-none text-zinc-400">
                          ▼
                        </span>
                      </SelectTrigger>
                      <SelectContent className="z-50 rounded-lg border border-white/20 bg-panel p-1.5 text-sm shadow-2xl">
                        {sorts.map((item) => (
                          <SelectItem
                            key={item.value}
                            value={item.value}
                            className="rounded px-3 py-2 text-zinc-300 data-[highlighted]:bg-white/40 data-[highlighted]:text-zinc-50 data-[selected]:text-zinc-50"
                          >
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              {searchFailed ? (
                <div role="alert" className="flex flex-col items-start gap-3 p-6">
                  <p className="text-base text-zinc-200">Could not search players.</p>
                  <p className="font-mono text-xs text-zinc-400">{search.error?.message}</p>
                  <button
                    type="button"
                    onClick={() => void search.refetch()}
                    className="rounded border border-white/40 px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-zinc-100 hover:bg-white/10"
                  >
                    Retry
                  </button>
                </div>
              ) : browseFailed && browse.error ? (
                <LoadError
                  title="Could not load players."
                  error={browse.error}
                  onRetry={() => void browse.refetch()}
                  className="p-6"
                />
              ) : (
                <PlayerList
                  sections={sections}
                  selected={p ?? null}
                  loading={listLoading}
                  emptyTitle={emptyTitle}
                  emptyHint={emptyHint}
                  hasMore={
                    !searchMode && !typing && browse.hasNextPage && !browse.isFetchNextPageError
                  }
                  loadingMore={loadingMore}
                  pendingCount={!searchMode && !typing && loadingMore ? playerPageSize : 0}
                  onLoadMore={loadMore}
                  focusSelectedOnMount={selectionSource === 'list'}
                  searchRef={searchRef}
                  onSelect={select}
                  onPrefetch={prefetch}
                  onEscape={escape}
                />
              )}
            </div>
          </section>
        </ResizablePanel>

        <ResizableHandle
          aria-label="Resize player list"
          className="hidden w-2 cursor-col-resize items-center justify-center outline-offset-[-2px] data-[dragging]:bg-accent/40 data-[hovering]:bg-white/10 lg:flex"
        >
          <span aria-hidden className="h-12 w-px bg-white/40" />
        </ResizableHandle>

        <ResizablePanel
          id="player-detail"
          minSize="420px"
          className={`min-h-0 max-lg:!w-full max-lg:!basis-full ${p ? 'flex' : 'hidden lg:flex'}`}
        >
          <section
            aria-label="Player detail"
            className="flex h-full w-full min-h-0 flex-col overflow-hidden"
          >
            {p ? (
              <PlayerDetailLoader
                puuid={p}
                preview={selectedPreview}
                cardId={selectedCard}
                focusOnMount={selectionSource !== null}
                focusHeading={selectionSource === 'search'}
                onBack={backToList}
              />
            ) : overview.isPending ? (
              <LoadingState label="Loading overview…" />
            ) : overview.isError ? (
              <LoadError
                title="Could not load the overview."
                error={overview.error}
                onRetry={() => void overview.refetch()}
                className="p-8"
              />
            ) : publicPlayers === 0 ? (
              <div className="flex h-full items-center justify-center">
                <EmptyState
                  title="No public players yet."
                  hint="Run a scan to populate the index. Banned and unresolved anonymous rows are hidden."
                />
              </div>
            ) : (
              <div className="relative flex h-full items-center justify-center overflow-hidden p-8">
                <div className="relative max-w-md text-center">
                  <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-accent">
                    master–detail
                  </p>
                  <h2 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-100 text-balance">
                    Pick a player.
                  </h2>
                  <p className="mt-4 text-sm leading-6 text-zinc-300">
                    Use <kbd className="font-mono text-zinc-100">j</kbd> /{' '}
                    <kbd className="font-mono text-zinc-100">k</kbd> to move, or{' '}
                    <kbd className="font-mono text-zinc-100">/</kbd> to search. Every rename, region
                    transfer, and ban stays on the timeline.
                  </p>
                  <div className="mt-7 flex items-center justify-center gap-6 border-y border-white/[0.08] py-4">
                    {[
                      ['players', overview.data?.stats.players],
                      ['linked anon', overview.data?.stats.linked],
                      ['name changes', overview.data?.stats.nameChanges],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <p className="text-lg font-semibold text-zinc-100 tabular-nums">
                          {value?.toLocaleString() ?? '—'}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                          {label}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 font-mono text-[11px] uppercase tracking-wide text-zinc-400">
                    pick a row to open the history
                  </div>
                </div>
              </div>
            )}
          </section>
        </ResizablePanel>
      </Resizable>

      <ScanStatus
        players={overview.data?.stats.publicPlayers ?? null}
        nameChanges={overview.data?.stats.nameChanges ?? null}
        lastRunAt={overview.data?.stats.lastRunAt ?? null}
        nextRunAt={overview.data?.stats.nextRunAt ?? null}
        cookieUpdatedAt={status.data?.auth.updatedAt}
        cookieStaleAfterMs={status.data?.auth.staleAfterMs}
        error={overview.error ?? (browseFailed ? browse.error : null)}
        onRetry={() => {
          void overview.refetch()
          void browse.refetch()
        }}
      />
    </div>
  )
}
