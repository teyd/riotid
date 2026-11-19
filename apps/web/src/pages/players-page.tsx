import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger } from '@ui-sdk/react/select'
import { Input } from '@ui-sdk/react/input'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Resizable, ResizableHandle, ResizablePanel } from '@ui-sdk/react/resizable'
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from '@ui-sdk/react/segmented-control'
import { Link, useNavigate } from '@tanstack/react-router'
import { useDeferredValue, useEffect, useMemo, useRef, useState, type SVGProps } from 'react'

import { PlayerDetailLoader } from '../components/player-detail-loader.tsx'
import { PlayerList } from '../components/player-list.tsx'
import { EmptyState, LoadingState } from '../components/ui.tsx'
import {
  displayName,
  fetchIndex,
  fetchPlayer,
  formatRelative,
  P,
  type IndexRow,
  type Region,
} from '../lib/api.ts'

type Sort = 'recentChanges' | 'changes' | 'recent' | 'new' | 'name'

let initialSelectionDone = false

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

const SearchIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" strokeLinecap="round" />
  </svg>
)

const score = (row: IndexRow) => row[P.nameChanges] * 2 + row[P.regionChanges] * 3

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
    const idle = window.requestIdleCallback(preload, { timeout: 2500 })
    return () => window.cancelIdleCallback(idle)
  }, [])

  const index = useQuery({
    queryKey: ['index'],
    queryFn: fetchIndex,
    staleTime: 60_000,
    refetchInterval: 120_000,
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

  const selectedRow = p ? (index.data?.players.find((row) => row[P.puuid] === p) ?? null) : null
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

  const select = (puuid: string | null) => {
    if (puuid) {
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

  const sortOption = sorts.find((item) => item.value === sort) ?? sorts[0]!
  const escape = () => {
    if (p) {
      select(null)
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
      <Resizable autoSaveId="riotid:split" className="flex min-h-0 flex-1">
        <ResizablePanel
          id="player-list"
          defaultSize="460px"
          minSize="360px"
          maxSize="760px"
          className={`min-h-0 max-lg:!w-full max-lg:!basis-full ${p ? 'hidden lg:flex' : 'flex'}`}
        >
          <section className="relative flex h-full w-full min-h-0 flex-col border-r border-white/[0.07]">
            <div className="border-b border-white/[0.08] px-4 pt-4 pb-3">
              <div className="flex h-10 min-w-0 items-center gap-2.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 focus-within:border-white/30">
                <SearchIcon className="size-4 shrink-0 text-zinc-500" />
                <Input
                  ref={searchRef}
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search players…"
                  aria-label="Search players"
                  spellCheck={false}
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent font-mono text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                />
                <kbd className="hidden rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 sm:block">
                  /
                </kbd>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <SegmentedControl
                  value={region}
                  onValueChange={(next) => {
                    if (
                      next === 'all' ||
                      next === 'na' ||
                      next === 'eu' ||
                      next === 'ap' ||
                      next === 'kr'
                    ) {
                      setRegion(next)
                    }
                  }}
                  aria-label="Region"
                  className="relative flex items-center gap-0.5 rounded-md border border-white/[0.07] bg-white/[0.02] p-0.5"
                >
                  <SegmentedControlIndicator className="rounded-[5px] bg-white/[0.08]" />
                  {regions.map((item) => (
                    <SegmentedControlItem
                      key={item.value}
                      value={item.value}
                      className="rounded-[5px] px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 transition-colors hover:text-zinc-300 data-[checked]:text-zinc-100"
                    >
                      {item.label}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>

                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
                    {rows.length.toLocaleString()}
                  </span>
                  <Select
                    value={sort}
                    onValueChange={(value) => {
                      if (value) setSort(value as Sort)
                    }}
                    items={sorts}
                  >
                    <SelectLabel className="sr-only">Sort players</SelectLabel>
                    <SelectTrigger
                      aria-label={`Sort players: ${sortOption?.label ?? sort}`}
                      className="flex h-7 items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-200"
                    >
                      <span>{sortOption?.trigger ?? sort}</span>
                      <span aria-hidden className="text-[9px] leading-none text-zinc-500">
                        ▼
                      </span>
                    </SelectTrigger>
                    <SelectContent className="z-50 rounded-lg border border-white/10 bg-panel p-1.5 text-sm shadow-2xl">
                      {sorts.map((item) => (
                        <SelectItem
                          key={item.value}
                          value={item.value}
                          className="rounded px-3 py-2 text-zinc-300 data-[highlighted]:bg-white/10 data-[highlighted]:text-zinc-50"
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
                searchRef={searchRef}
                onSelect={select}
                onPrefetch={prefetch}
                onEscape={escape}
              />
            </div>

            <div className="border-t border-white/[0.06] px-4 py-3 font-mono text-[10px] text-zinc-500">
              {index.isError ? (
                <span className="text-zinc-300">API offline — retrying</span>
              ) : (
                <span>
                  {index.data?.players.length.toLocaleString() ?? '—'} public players ·{' '}
                  {index.data?.stats.nameChanges.toLocaleString() ?? '—'} name changes ·{' '}
                  {formatRelative(index.data?.stats.lastRunAt ?? null)}
                </span>
              )}
            </div>
          </section>
        </ResizablePanel>

        <ResizableHandle
          aria-label="Resize player list"
          className="hidden w-2 cursor-col-resize items-center justify-center focus-visible:outline-none data-[dragging]:bg-accent/40 lg:flex"
        >
          <span className="h-12 w-px bg-white/10" />
        </ResizableHandle>

        <ResizablePanel
          id="player-detail"
          minSize="420px"
          className={`min-h-0 max-lg:!w-full max-lg:!basis-full ${p ? 'flex' : 'hidden lg:flex'}`}
        >
          {p ? (
            <PlayerDetailLoader
              puuid={p}
              row={selectedRow}
              cardId={selectedCard}
              onBack={() => select(null)}
            />
          ) : index.isPending ? (
            <LoadingState label="Loading index" />
          ) : (
            <div className="relative flex h-full items-center justify-center overflow-hidden p-8">
              <div className="relative max-w-md text-center">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
                  master–detail
                </p>
                <h2 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-100 text-balance">
                  Pick a player.
                </h2>
                <p className="mt-4 text-sm leading-6 text-zinc-400">
                  Use <kbd className="font-mono text-zinc-200">j</kbd> /{' '}
                  <kbd className="font-mono text-zinc-200">k</kbd> to move, or{' '}
                  <kbd className="font-mono text-zinc-200">/</kbd> to search. Every rename, region
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
                      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">
                        {label}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex justify-center gap-4 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
                  <Link to="/stats" className="hover:text-zinc-200">
                    stats
                  </Link>
                  <Link to="/crawler" className="hover:text-zinc-200">
                    crawler
                  </Link>
                  <Link to="/status" className="hover:text-zinc-200">
                    status
                  </Link>
                </div>
              </div>
            </div>
          )}
          {!p && !index.isError && (index.data?.players.length ?? 0) === 0 ? (
            <EmptyState
              title="No public players yet."
              hint="Run a scan to populate the index. Banned and unresolved anonymous rows are hidden."
            />
          ) : null}
        </ResizablePanel>
      </Resizable>
    </div>
  )
}
