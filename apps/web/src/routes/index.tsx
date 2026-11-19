import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@ui-sdk/react/select'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import SearchIcon from 'kubai-icons-react/icons/search'
import { useDeferredValue, useMemo, useRef, useState } from 'react'

import { PlayerDetailPanel } from '../components/player-detail.tsx'
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

type Sort = 'recent' | 'changes' | 'new' | 'name'

const sorts: Array<{ value: Sort; label: string }> = [
  { value: 'recent', label: 'Recent activity' },
  { value: 'changes', label: 'Most changes' },
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

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    p: typeof search.p === 'string' ? search.p : undefined,
  }),
  component: Home,
})

const score = (row: IndexRow) => row[P.nameChanges] * 2 + row[P.regionChanges] * 3

function Home() {
  const { p } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<'all' | Region>('all')
  const [sort, setSort] = useState<Sort>('recent')
  const deferredQuery = useDeferredValue(query)

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

  const select = (puuid: string | null) =>
    void navigate({
      to: '/',
      search: { p: puuid ?? undefined },
      replace: true,
    })

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
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,430px)_minmax(0,1fr)]">
        <section
          className={`min-h-0 flex-col border-r border-white/[0.06] ${p ? 'hidden lg:flex' : 'flex'}`}
        >
          <div className="border-b border-white/[0.06] px-3 py-3">
            <div className="flex items-center gap-2">
              <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-white/10 bg-black/25 px-2.5 focus-within:border-accent/50">
                <SearchIcon className="size-3.5 shrink-0 text-zinc-600" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, tag, puuid"
                  spellCheck={false}
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                />
                <kbd className="hidden rounded border border-white/10 px-1 font-mono text-[9px] text-zinc-600 sm:block">
                  /
                </kbd>
              </label>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-0.5 rounded-md border border-white/[0.08] p-0.5">
                {regions.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setRegion(item.value)}
                    data-active={region === item.value}
                    className="rounded px-1.5 py-1 font-mono text-[9px] uppercase tracking-wide text-zinc-500 hover:text-zinc-300 data-[active=true]:bg-white/10 data-[active=true]:text-zinc-100"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-zinc-600">
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
                  <SelectTrigger className="flex h-6 items-center gap-1 rounded border border-white/10 px-1.5 font-mono text-[9px] uppercase tracking-wide text-zinc-400 hover:border-white/25">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-50 rounded-md border border-white/10 bg-panel p-1 text-xs shadow-2xl">
                    {sorts.map((item) => (
                      <SelectItem
                        key={item.value}
                        value={item.value}
                        className="rounded px-2 py-1.5 text-zinc-300 data-[highlighted]:bg-white/10 data-[highlighted]:text-zinc-50"
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
              selected={p ?? null}
              loading={index.isPending}
              searchRef={searchRef}
              onSelect={select}
              onPrefetch={prefetch}
              onEscape={escape}
            />
          </div>

          <div className="border-t border-white/[0.06] px-3 py-2 font-mono text-[9px] text-zinc-600">
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

        <section className={`min-h-0 flex-col ${p ? 'flex' : 'hidden lg:flex'}`}>
          {p ? (
            <PlayerDetailPanel puuid={p} row={selectedRow} onBack={() => select(null)} />
          ) : index.isPending ? (
            <LoadingState label="Loading index" />
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <div className="max-w-sm text-center">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                  master–detail
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
                  Pick a player.
                </h2>
                <p className="mt-3 text-sm leading-6 text-zinc-500">
                  Use <kbd className="font-mono text-zinc-300">j</kbd> /{' '}
                  <kbd className="font-mono text-zinc-300">k</kbd> to move, or{' '}
                  <kbd className="font-mono text-zinc-300">/</kbd> to search. Every rename, region
                  transfer, and ban stays on the timeline.
                </p>
                <div className="mt-5 flex justify-center gap-3 font-mono text-[10px] text-zinc-600">
                  <Link to="/stats" className="hover:text-zinc-300">
                    stats
                  </Link>
                  <Link to="/status" className="hover:text-zinc-300">
                    status
                  </Link>
                </div>
              </div>
            </div>
          )}
          {!p && index.isError ? (
            <div className="border-t border-amber-400/20 bg-amber-400/[0.05] px-4 py-2 text-xs text-amber-300">
              {index.error.message}
            </div>
          ) : null}
          {!p && !index.isError && (index.data?.players.length ?? 0) === 0 ? (
            <EmptyState
              title="No public players yet."
              hint="Run a scan to populate the index. Banned and unresolved anonymous rows are hidden."
            />
          ) : null}
        </section>
      </div>
    </div>
  )
}
