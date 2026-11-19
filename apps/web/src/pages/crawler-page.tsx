import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import {
  fetchCrawler,
  formatDateTime,
  formatRelative,
  regionLabel,
  regionShort,
  type CrawlerSnapshot,
} from '../lib/api.ts'
import { EmptyState, ErrorState, LoadingState } from '../components/ui.tsx'

export function CrawlerPage() {
  const query = useQuery({
    queryKey: ['crawler'],
    queryFn: fetchCrawler,
    staleTime: 10_000,
  })
  const [live, setLive] = useState<CrawlerSnapshot | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const source = new EventSource('/api/v1/crawler/stream')

    source.addEventListener('open', () => setConnected(true))
    source.addEventListener('error', () => setConnected(false))
    source.addEventListener('snapshot', (event) => {
      try {
        setLive(JSON.parse((event as MessageEvent).data) as CrawlerSnapshot)
        setConnected(true)
      } catch {
        setConnected(false)
      }
    })

    return () => source.close()
  }, [])

  const snapshot = live ?? query.data

  if (!snapshot) {
    if (query.isError) return <ErrorState error={query.error} />
    return <LoadingState label="Connecting to the crawler" />
  }

  return (
    <div className="mx-auto h-full w-full max-w-6xl overflow-y-auto px-5 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
            identity pipeline
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Match crawler</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            A live view of the compact match-candidate cache used to resolve anonymized leaderboard
            rows. Only participant fingerprints are stored — never full match data.
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide">
          <span
            className={`size-2 rounded-full ${connected ? 'animate-pulse bg-accent' : 'bg-zinc-600'}`}
          />
          <span className={connected ? 'text-zinc-300' : 'text-zinc-500'}>
            {connected ? 'live stream' : 'reconnecting'}
          </span>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-5 border-y border-white/[0.08] py-5 sm:grid-cols-4">
        {[
          ['matches cached', snapshot.cache.matches.toLocaleString()],
          ['participant rows', snapshot.cache.rows.toLocaleString()],
          ['requests today', snapshot.requestsToday.toLocaleString()],
          ['last pass', formatRelative(snapshot.lastRunAt)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              {label}
            </p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight text-zinc-100 tabular-nums">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
          Recently discovered matches
        </h2>
        <p className="font-mono text-[10px] text-zinc-600">
          {snapshot.running ? 'resolver pass in progress' : 'resolver idle'}
        </p>
      </div>

      {snapshot.matches.length === 0 ? (
        <EmptyState
          title="No cached matches yet."
          hint="Run the identity resolver once to seed the cache. The daily scheduler keeps it warm."
        />
      ) : (
        <div className="mt-2">
          <div className="hidden grid-cols-[1fr_100px_90px_120px_120px] gap-3 border-b border-white/[0.08] py-2 font-mono text-[10px] uppercase tracking-wide text-zinc-600 sm:grid">
            <span>match</span>
            <span>region</span>
            <span className="text-right">players</span>
            <span className="text-right">started</span>
            <span className="text-right">discovered</span>
          </div>
          {snapshot.matches.map((match) => (
            <a
              key={match.matchId}
              href={`https://vtl.lol/match/${match.matchId}`}
              target="_blank"
              rel="noreferrer noopener"
              className="grid grid-cols-2 gap-3 border-b border-white/[0.04] py-3 transition-colors hover:bg-white/[0.03] sm:grid-cols-[1fr_100px_90px_120px_120px] sm:items-center"
            >
              <span className="flex min-w-0 items-center gap-2 font-mono text-xs text-zinc-300">
                <span className="truncate">{match.matchId}</span>
                <span aria-hidden="true" className="shrink-0 text-zinc-600">
                  ↗
                </span>
              </span>
              <span className="text-right font-mono text-[11px] text-zinc-400 sm:text-left">
                {regionLabel(match.region)}
                <span className="ml-1 text-zinc-600 sm:hidden">{regionShort(match.region)}</span>
              </span>
              <span className="text-right font-mono text-[11px] text-zinc-400 tabular-nums">
                {match.participants}
              </span>
              <span className="text-right font-mono text-[11px] text-zinc-500 tabular-nums">
                {formatDateTime(match.gameStartAt).slice(0, 10)}
              </span>
              <span className="text-right font-mono text-[11px] text-zinc-500">
                {formatRelative(match.discoveredAt)}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
