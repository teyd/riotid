import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@ui-sdk/react/select'
import { Input } from '@ui-sdk/react/input'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Resizable, ResizableHandle, ResizablePanel } from '@ui-sdk/react/resizable'
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from '@ui-sdk/react/segmented-control'
import { useNavigate } from '@tanstack/react-router'
import { useDeferredValue, useEffect, useMemo, useRef, useState, type SVGProps } from 'react'

import { PlayerDetailLoader } from '../components/player-detail-loader.tsx'
import { PlayerList } from '../components/player-list.tsx'
import { EmptyState, LoadingState } from '../components/ui.tsx'
import {
  displayName,
  fetchIndex,
  fetchPlayer,
  fetchStatus,
  formatRelative,
  formatScanCountdown,
  formatScanTime,
  P,
  type IndexRow,
  type Region,
} from '../lib/api.ts'

type Sort = 'recentChanges' | 'changes' | 'recent' | 'new' | 'name'

let initialSelectionDone = false
let restoreSearchFocus = false
let selectionSource: 'list' | 'search' | null = null

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

const score = (row: IndexRow) => row[P.nameChanges] * 2 + row[P.regionChanges] * 3

type ScanStatusProps = {
  players: number | null
  nameChanges: number | null
  lastRunAt: number | null
  nextRunAt: number | null
  cookieUpdatedAt: number | null | undefined
  cookieStaleAfterMs: number | undefined
  isError: boolean
  onRetry: () => void
}

const ScanStatus = ({
  players,
  nameChanges,
  lastRunAt,
  nextRunAt,
  cookieUpdatedAt,
  cookieStaleAfterMs,
  isError,
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
      role={isError ? 'status' : undefined}
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/[0.06] px-4 py-2.5 font-mono text-[11px] text-zinc-400"
    >
      {isError ? (
        <>
          <span className="text-zinc-300">API offline — retrying</span>
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
    </footer>
  )
}

export function PlayersPage({ selected }: { selected?: string }) {
  const p = selected ?? null
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<'all' | Region>('all')
  const [sort, setSort] = useState<Sort>('recentChanges')
  const deferredQuery = useDeferredValue(query)

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

  const index = useQuery({
    queryKey: ['index'],
    queryFn: fetchIndex,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: true,
  })

  const status = useQuery({
    queryKey: ['status'],
    queryFn: fetchStatus,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  })

  const rows = useMemo(() => {
    const all = index.data?.players ?? []
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

    return [...filtered].sort((left, right) => {
      switch (sort) {
        case 'recentChanges':
          return (
            (right[P.lastNameChangeAt] ?? 0) - (left[P.lastNameChangeAt] ?? 0) ||
            score(right) - score(left) ||
            right[P.lastSeenAt] - left[P.lastSeenAt]
          )
        case 'changes':
          return score(right) - score(left) || right[P.lastSeenAt] - left[P.lastSeenAt]
        case 'new':
          return right[P.firstSeenAt] - left[P.firstSeenAt]
        case 'name':
          return displayName(left).localeCompare(displayName(right))
        default:
          return right[P.lastSeenAt] - left[P.lastSeenAt]
      }
    })
  }, [index.data, deferredQuery, region, sort])

  const playersById = useMemo(
    () => new Map((index.data?.players ?? []).map((row) => [row[P.puuid], row])),
    [index.data],
  )

  const selectedRow = p ? (playersById.get(p) ?? null) : null
  const selectedCardIndex = selectedRow?.[P.cardId]
  const selectedCard =
    selectedCardIndex == null ? null : (index.data?.cards[selectedCardIndex] ?? null)

  useEffect(() => {
    if (p) {
      initialSelectionDone = true
      return
    }
    if (initialSelectionDone || index.isPending || rows.length === 0) return
    if (!window.matchMedia('(min-width: 1024px)').matches) return

    const first = rows[0]?.[P.puuid]
    if (first) {
      initialSelectionDone = true
      void navigate({ to: '/puuid/$puuid', params: { puuid: first }, replace: true })
    }
  }, [p, index.isPending, rows, navigate])

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
      queryFn: () => fetchPlayer(puuid),
      staleTime: 60_000,
    })
  }

  const backToList = () => {
    restoreSearchFocus = true
    select(null)
  }

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
                    if (event.key === 'Enter' && rows[0]) {
                      event.preventDefault()
                      select(rows[0][P.puuid], 'search')
                    }
                    if (event.key === 'ArrowDown' && rows[0]) {
                      event.preventDefault()
                      select(rows[0][P.puuid], 'search')
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
                  placeholder="Search players…"
                  aria-label="Search players"
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
                    {rows.length.toLocaleString()}
                  </span>
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
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <PlayerList
                rows={rows}
                cards={index.data?.cards ?? []}
                selected={p ?? null}
                loading={index.isPending}
                filtered={deferredQuery.trim() !== '' || region !== 'all'}
                focusSelectedOnMount={selectionSource === 'list'}
                searchRef={searchRef}
                onSelect={select}
                onPrefetch={prefetch}
                onEscape={escape}
              />
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
                row={selectedRow}
                cardId={selectedCard}
                focusOnMount={selectionSource !== null}
                focusHeading={selectionSource === 'search'}
                onBack={backToList}
              />
            ) : index.isPending ? (
              <LoadingState label="Loading index…" />
            ) : index.isError ? (
              <div role="alert" className="flex flex-col items-start gap-3 p-8">
                <p className="text-base text-zinc-200">Could not load the player index.</p>
                <p className="font-mono text-xs text-zinc-400">{index.error.message}</p>
                <button
                  type="button"
                  onClick={() => void index.refetch()}
                  className="rounded border border-white/40 px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-zinc-100 hover:bg-white/10"
                >
                  Retry
                </button>
              </div>
            ) : (index.data?.players.length ?? 0) === 0 ? (
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
                      ['players', index.data?.stats.players],
                      ['linked anon', index.data?.stats.linked],
                      ['name changes', index.data?.stats.nameChanges],
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
        players={index.data?.players.length ?? null}
        nameChanges={index.data?.stats.nameChanges ?? null}
        lastRunAt={index.data?.stats.lastRunAt ?? null}
        nextRunAt={index.data?.stats.nextRunAt ?? null}
        cookieUpdatedAt={status.data?.auth.updatedAt}
        cookieStaleAfterMs={status.data?.auth.staleAfterMs}
        isError={index.isError}
        onRetry={() => void index.refetch()}
      />
    </div>
  )
}
