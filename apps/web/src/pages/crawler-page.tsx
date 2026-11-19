import { Progress, ProgressIndicator, ProgressTrack } from '@ui-sdk/react/progress'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { chartAxisTick, chartTooltipStyle, regionColors } from '../components/charts.tsx'
import { MetricGrid, Panel } from '../components/panel.tsx'
import { EmptyState, ErrorState, LoadingState } from '../components/ui.tsx'
import {
  fetchCrawler,
  formatDateTime,
  formatRelative,
  formatUntil,
  regionLabel,
  regionShort,
  type CrawlerSnapshot,
} from '../lib/api.ts'

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

  const activity = snapshot.activity
  const budget = Math.max(1, activity?.budget ?? 1000)
  const used = activity?.requests ?? snapshot.requestsToday
  const usedPct = Math.min(100, (used / budget) * 100)
  const byRegion = Object.entries(snapshot.cache.byRegion).map(([region, matches]) => ({
    region: regionShort(region),
    label: regionLabel(region),
    matches,
    color: regionColors[region] ?? '#a1a1aa',
  }))

  return (
    <div className="mx-auto h-full w-full max-w-6xl overflow-y-auto px-5 py-9 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-zinc-500">
            identity pipeline
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-50">Match crawler</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            A live view of the compact match-candidate cache used to resolve anonymized leaderboard
            rows. The crawler runs continuously in small batches and paces every Riot request. Only
            participant fingerprints are stored — never full match data.
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide">
          <span
            className={`size-1.5 rounded-full ${connected ? 'animate-pulse bg-[#4ade80]' : 'bg-zinc-600'}`}
          />
          <span className={connected ? 'text-zinc-300' : 'text-zinc-500'}>
            {connected ? 'live stream' : 'reconnecting'}
          </span>
        </div>
      </div>

      <MetricGrid
        className="mt-8 sm:grid-cols-4"
        items={[
          ['matches cached', snapshot.cache.matches],
          ['participant rows', snapshot.cache.rows],
          ['requests today', snapshot.requestsToday],
          ['last pass', formatRelative(snapshot.lastRunAt)],
        ]}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel
          title={snapshot.running ? 'current activity' : 'last activity'}
          meta={activity ? `${activity.phase} · ${formatRelative(activity.updatedAt)}` : 'waiting'}
        >
          {activity ? (
            <>
              <p className="mt-2 text-lg font-medium text-zinc-100">{activity.message}</p>
              {snapshot.schedule.message ? (
                <p className="mt-1.5 font-mono text-[11px] uppercase tracking-wide text-zinc-500">
                  {snapshot.schedule.message}
                  {snapshot.schedule.nextRunAt
                    ? ` · ${formatUntil(snapshot.schedule.nextRunAt)}`
                    : ''}
                </p>
              ) : null}

              <div className="mt-5">
                <div className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-wide text-zinc-500">
                  <span>riot requests</span>
                  <span className="tabular-nums">
                    {used} / {budget}
                  </span>
                </div>
                <Progress value={usedPct} aria-label="Riot request budget">
                  <ProgressTrack className="mt-2 h-1 overflow-hidden rounded bg-white/[0.07]">
                    <ProgressIndicator className="h-full rounded bg-[#4ade80]" />
                  </ProgressTrack>
                </Progress>
              </div>

              <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-white/[0.06] pt-4 font-mono text-[11px]">
                <div>
                  <dt className="uppercase tracking-wide text-zinc-500">matches fetched</dt>
                  <dd className="mt-1 text-lg text-zinc-100 tabular-nums">
                    {activity.matchesFetched.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wide text-zinc-500">links</dt>
                  <dd className="mt-1 text-lg text-zinc-100 tabular-nums">{activity.linked}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wide text-zinc-500">ambiguous</dt>
                  <dd className="mt-1 text-lg text-zinc-100 tabular-nums">{activity.ambiguous}</dd>
                </div>
              </dl>

              {activity.currentMatchId ? (
                <p className="mt-4 truncate font-mono text-[11px] text-zinc-500">
                  current match{' '}
                  <a
                    href={`https://vtl.lol/match/${activity.currentMatchId}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[#4ade80] hover:underline"
                  >
                    {activity.currentMatchId}
                  </a>
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-medium text-zinc-100">Waiting for the next batch</p>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                The resolver last ran {formatRelative(snapshot.lastRunAt)}. Batches seed the graph
                from nearby players, check exact MMR fingerprints, and write only confirmed links.
              </p>
            </>
          )}

          <p className="mt-4 border-t border-white/[0.06] pt-4 text-xs leading-5 text-zinc-500">
            Leaderboard scans take priority: the crawler pauses while a scan runs, yields if one
            begins mid-batch, and spreads small batches across the day until the Riot budget is
            spent. It is not a continuous match archive.
          </p>
        </Panel>

        <Panel title="cache by region" meta={`${snapshot.cache.matches.toLocaleString()} matches`}>
          <div className="mt-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={byRegion}
                layout="vertical"
                margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
                barSize={18}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="region"
                  tick={chartAxisTick}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={{ color: '#a1a1aa' }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  formatter={(value) => [Number(value).toLocaleString(), 'matches']}
                />
                <Bar dataKey="matches" radius={[2, 2, 2, 2]}>
                  {byRegion.map((entry) => (
                    <Cell key={entry.region} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <dl className="mt-2 space-y-1.5 border-t border-white/[0.06] pt-3 font-mono text-[11px]">
            {byRegion.map((entry) => (
              <div key={entry.region} className="flex justify-between">
                <dt className="text-zinc-500">{entry.label}</dt>
                <dd className="text-zinc-300 tabular-nums">{entry.matches.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <section className="mt-4 rounded-lg border border-white/[0.08]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            recently discovered matches
          </h2>
          <p className="font-mono text-[11px] text-zinc-500">
            latest {snapshot.matches.length} of {snapshot.cache.matches.toLocaleString()} ·{' '}
            {snapshot.running ? 'pass in progress' : 'resolver idle'}
          </p>
        </div>

        {snapshot.matches.length === 0 ? (
          <EmptyState
            title="No cached matches yet."
            hint="Run the identity resolver once to seed the cache. The daily scheduler keeps it warm."
          />
        ) : (
          <div className="px-5 pb-2">
            <div className="hidden grid-cols-[1fr_100px_90px_120px_120px] gap-3 border-b border-white/[0.08] py-2 font-mono text-[11px] uppercase tracking-wide text-zinc-500 sm:grid">
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
                className="grid grid-cols-2 gap-3 border-b border-white/[0.04] py-3 transition-colors last:border-0 hover:bg-white/[0.03] sm:grid-cols-[1fr_100px_90px_120px_120px] sm:items-center"
              >
                <span className="flex min-w-0 items-center gap-2 font-mono text-xs text-zinc-300">
                  <span className="truncate">{match.matchId}</span>
                  <span aria-hidden="true" className="shrink-0 text-zinc-500">
                    ↗
                  </span>
                </span>
                <span className="text-right font-mono text-[12px] text-zinc-400 sm:text-left">
                  {regionLabel(match.region)}
                  <span className="ml-1 text-zinc-500 sm:hidden">{regionShort(match.region)}</span>
                </span>
                <span className="text-right font-mono text-[12px] text-zinc-400 tabular-nums">
                  {match.participants}
                </span>
                <span className="text-right font-mono text-[12px] text-zinc-500 tabular-nums">
                  {formatDateTime(match.gameStartAt).slice(0, 10)}
                </span>
                <span className="text-right font-mono text-[12px] text-zinc-500">
                  {formatRelative(match.discoveredAt)}
                </span>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
