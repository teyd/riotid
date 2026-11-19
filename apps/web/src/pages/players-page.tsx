import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@ui-sdk/react/select'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Resizable, ResizableHandle, ResizablePanel } from '@ui-sdk/react/resizable'
import { Toggle, ToggleGroup } from '@ui-sdk/react/toggle'
import { Link, useNavigate } from '@tanstack/react-router'
import SearchIcon from 'kubai-icons-react/icons/search'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

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

const sorts: Array<{ value: Sort; label: string }> = [
  { value: 'recentChanges', label: 'Recent name changes' },
  { value: 'changes', label: 'Most changes' },
  { value: 'recent', label: 'Recent activity' },
  { value: 'new', label: 'Newest tracked' },
  { value: 'name', label: 'Name A–Z' },
]

const regions: ReadonlyArray<{ value: 'all' | Region; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'na', label: 'NA' },
  { value: 'eu', label: 'EU' },
  { value: 'ap', label: 'AP' },
  { value: 'kr', label: 'KR' },
]

const score = (row: IndexRow) => row[P.nameChanges] * 2 + row[P.regionChanges] * 3

export function PlayersPage({ selected }: { selected?: string }) {
  const p = selected ?? null
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<'all' | Region>('all')
  const [sort, setSort] = useState<Sort>('recentChanges')
  const [initialLayout] = useState<number[] | undefined>(() => {
    const stored = Number(window.localStorage.getItem('riotid:split'))
    return Number.isFinite(stored) && stored > 15 && stored < 85
      ? [stored, 100 - stored]
      : undefined
  })
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
      <Resizable
        {...(initialLayout ? { defaultLayout: initialLayout } : {})}
        onLayoutCommit={(layout) => {
          window.localStorage.setItem('riotid:split', String(layout[0]))
        }}
        className="flex min-h-0 flex-1"
      >
        <ResizablePanel
          id="player-list"
          defaultSize={32}
          minSize={25}
          maxSize={55}
          className={`min-h-0 max-lg:!w-full ${p ? 'hidden lg:flex' : 'flex'}`}
        >
          <section className="relative flex h-full min-h-0 flex-col border-r border-white/[0.07]">
            <div className="border-b border-white/[0.07] px-4 py-4">
              <label className="flex h-11 min-w-0 items-center gap-2.5 rounded-lg border border-white/10 bg-black/25 px-3 focus-within:border-accent/50">
                <SearchIcon className="size-4 shrink-0 text-zinc-500" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, tag, puuid…"
                  aria-label="Search players"
                  spellCheck={false}
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent font-mono text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                />
                <kbd className="hidden rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 sm:block">
                  /
                </kbd>
              </label>

              <div className="mt-3 flex items-center justify-between gap-3">
                <ToggleGroup
                  value={[region]}
                  onValueChange={(values) => {
                    const next = values[0]
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
                  deselectable={false}
                  aria-label="Region"
                  className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] p-1"
                >
                  {regions.map((item) => (
                    <Toggle
                      key={item.value}
                      value={item.value}
                      className="rounded-md px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-200 data-[pressed]:bg-white/10 data-[pressed]:text-zinc-100"
                    >
                      {item.label}
                    </Toggle>
                  ))}
                </ToggleGroup>

                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[11px] text-zinc-500">
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
                    <SelectTrigger className="flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 font-mono text-[10px] uppercase tracking-wide text-zinc-400 hover:border-white/25">
                      <SelectValue />
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
                <span className="text-amber-400">API offline — retrying</span>
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
          minSize="360px"
          className={`min-h-0 max-lg:!w-full ${p ? 'flex' : 'hidden lg:flex'}`}
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
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_65%_35%,rgba(74,222,128,0.06),transparent_42%)]" />
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
