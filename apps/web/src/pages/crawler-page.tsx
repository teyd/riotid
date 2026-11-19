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

      {snapshot.activity ? (
        <section className="mt-7 border-y border-white/[0.08] py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                {snapshot.running ? 'currently' : 'last activity'}
              </p>
              <p className="mt-1 text-lg font-medium text-zinc-100">{snapshot.activity.message}</p>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">
              {snapshot.activity.phase} · {formatRelative(snapshot.activity.updatedAt)}
            </span>
          </div>
          <div className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-3">
            <div>
              <div className="flex justify-between font-mono text-[10px] uppercase tracking-wide text-zinc-500">
                <span>requests</span>
                <span className="tabular-nums">
                  {snapshot.activity.requests} / {snapshot.activity.budget}
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded bg-white/[0.07]">
                <div
                  className="h-full rounded bg-accent"
                  style={{
                    width: `${Math.min(100, (snapshot.activity.requests / Math.max(1, snapshot.activity.budget)) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">
              <span>matches fetched</span>
              <span className="ml-2 text-zinc-200 tabular-nums">
                {snapshot.activity.matchesFetched.toLocaleString()}
              </span>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">
              <span>links</span>
              <span className="ml-2 text-zinc-200 tabular-nums">{snapshot.activity.linked}</span>
              {snapshot.activity.ambiguous > 0 ? (
                <span className="ml-3 text-amber-300/80">
                  {snapshot.activity.ambiguous} ambiguous
                </span>
              ) : null}
            </div>
          </div>
          {snapshot.activity.currentMatchId ? (
            <p className="mt-3 font-mono text-[10px] text-zinc-500">
              current match{' '}
              <a
                href={`https://vtl.lol/match/${snapshot.activity.currentMatchId}`}
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent hover:underline"
              >
                {snapshot.activity.currentMatchId}
              </a>
            </p>
          ) : null}
          <p className="mt-3 text-xs leading-5 text-zinc-600">
            The crawler is budgeted and runs daily; it enriches the match graph around anonymous
            leaderboard rows, then stops. It is not a continuous match archive.
          </p>
        </section>
      ) : (
        <section className="mt-7 border-y border-white/[0.08] py-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            last activity
          </p>
          <p className="mt-1 text-lg font-medium text-zinc-100">Waiting for the next daily pass</p>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-zinc-500">
            The resolver last ran {formatRelative(snapshot.lastRunAt)} and has used{' '}
            {snapshot.requestsToday.toLocaleString()} requests today. A pass seeds the graph from
            nearby players, fetches up to 300 new match details, checks exact MMR fingerprints, and
            writes only confirmed links. It stops at the daily budget rather than scraping forever.
          </p>
        </section>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
          Recently discovered matches
        </h2>
        <p className="font-mono text-[10px] text-zinc-600">
          latest {snapshot.matches.length} of {snapshot.cache.matches.toLocaleString()} ·{' '}
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
