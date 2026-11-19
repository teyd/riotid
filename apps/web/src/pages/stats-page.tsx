import { Meter, MeterIndicator, MeterTrack } from '@ui-sdk/react/meter'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  Donut,
  chartAxisTick,
  chartColors,
  chartTooltipStyle,
  regionColors,
} from '../components/charts.tsx'
import { CoveragePanel } from '../components/coverage-panel.tsx'
import { MetricGrid, Panel, StatRow } from '../components/panel.tsx'
import { ErrorState, LoadingState } from '../components/ui.tsx'
import { fetchStats, formatRelative, regionLabel, type SiteStats } from '../lib/api.ts'

const compact = (value: number): string =>
  new Intl.NumberFormat(undefined, {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value)

const fullDate = (at: number): string =>
  new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const axisDate = (at: number): string =>
  new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const axisTime = (at: number): string =>
  new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

const delta = (first: number, last: number): string => {
  const change = last - first
  if (change === 0) return 'flat'
  return `${change > 0 ? '+' : '−'}${compact(Math.abs(change))}`
}

type SignalPoint = { at: number; full: string; value: number }

const ChartTip = ({
  active,
  payload,
  label,
  color,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ value?: string | number; payload?: SignalPoint }>
  label?: string
  color: string
}) => {
  if (!active || !payload?.length) return null
  const value = Number(payload[0]?.value ?? 0)
  const point = payload[0]?.payload

  return (
    <div className="rounded-md border border-white/10 bg-black px-3 py-2 shadow-xl">
      <p className="font-mono text-[10px] text-zinc-500">{point?.full ?? label}</p>
      <p className="mt-1 flex items-center gap-2 font-mono text-xs text-zinc-100">
        <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
        {value.toLocaleString()}
      </p>
    </div>
  )
}

const SignalAxes = ({
  data,
  color,
  kind,
  tickFormatter,
}: {
  data: ReadonlyArray<SignalPoint>
  color: string
  kind: 'area' | 'bar'
  tickFormatter: (at: number) => string
}) => (
  <>
    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
    <XAxis
      dataKey="at"
      type="number"
      domain={['dataMin', 'dataMax']}
      tick={chartAxisTick}
      tickFormatter={tickFormatter}
      {...(data.length <= 6 ? { ticks: data.map((point) => point.at) } : {})}
      axisLine={false}
      tickLine={false}
      minTickGap={28}
      padding={{ left: 10, right: 10 }}
    />
    <YAxis
      tick={chartAxisTick}
      axisLine={false}
      tickLine={false}
      width={38}
      {...(kind === 'area' ? { tickFormatter: compact } : { allowDecimals: false })}
    />
    <Tooltip
      content={<ChartTip color={color} />}
      cursor={
        kind === 'area'
          ? { stroke: 'rgba(255,255,255,0.16)', strokeDasharray: '3 3' }
          : { fill: 'rgba(255,255,255,0.04)' }
      }
    />
  </>
)

const SignalCard = ({
  title,
  note,
  value,
  peak,
  change,
  color,
  data,
  kind,
  tickFormatter,
}: {
  title: string
  note: string
  value: number
  peak: number
  change: string
  color: string
  data: ReadonlyArray<SignalPoint>
  kind: 'area' | 'bar'
  tickFormatter: (at: number) => string
}) => {
  const gradientId = `signal-${title.replaceAll(' ', '-')}`
  const chart = (
    <div className="mt-3 h-32" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        {kind === 'area' ? (
          <AreaChart data={[...data]} margin={{ top: 4, right: 24, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.16} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <SignalAxes data={data} color={color} kind="area" tickFormatter={tickFormatter} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.75}
              fill={`url(#${gradientId})`}
              dot={data.length < 8 ? { r: 2, strokeWidth: 0, fill: color } : false}
              activeDot={{ r: 3, strokeWidth: 0, fill: color }}
            />
          </AreaChart>
        ) : (
          <BarChart data={[...data]} margin={{ top: 4, right: 24, bottom: 0, left: 0 }}>
            <SignalAxes data={data} color={color} kind="bar" tickFormatter={tickFormatter} />
            <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} maxBarSize={14} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )

  return (
    <div className="bg-black p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-400">{title}</h3>
        <span className="font-mono text-[10px] text-zinc-600 tabular-nums">{change}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-semibold tracking-tight text-zinc-50 tabular-nums">
          {value.toLocaleString()}
        </span>
        <span className="font-mono text-[10px] text-zinc-600">last scan</span>
        <span className="font-mono text-[10px] text-zinc-600">peak {compact(peak)}</span>
      </div>
      {chart}
      <p className="mt-2 text-[11px] leading-5 text-zinc-600">{note}</p>
    </div>
  )
}

type RecentRow = {
  key: string
  puuid: string
  label: ReactNode
  meta: string
}

const RecentList = ({ rows, empty }: { rows: ReadonlyArray<RecentRow>; empty: string }) => (
  <div className="mt-2 divide-y divide-white/[0.05]">
    {rows.length === 0 ? (
      <p className="py-3 text-sm text-zinc-500">{empty}</p>
    ) : (
      rows.map((row) => (
        <Link
          key={row.key}
          to="/puuid/$puuid"
          params={{ puuid: row.puuid }}
          className="flex items-baseline justify-between gap-3 py-2.5 hover:text-zinc-100"
        >
          <span className="truncate text-sm text-zinc-300">{row.label}</span>
          <span className="shrink-0 font-mono text-[10px] text-zinc-500">{row.meta}</span>
        </Link>
      ))
    )}
  </div>
)

const RegionCard = ({ region, data }: { region: string; data: SiteStats['regions'][string] }) => {
  const tiers = Object.entries(data.tiers)
    .map(([tier, count]) => ({ tier: `T${tier}`, count }))
    .sort((left, right) => Number(left.tier.slice(1)) - Number(right.tier.slice(1)))
    .slice(-6)
  const color = regionColors[region] ?? chartColors.players

  return (
    <div className="rounded-lg border border-white/[0.08] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-medium text-zinc-100">{regionLabel(region)}</h3>
        <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-600">
          {data.players.toLocaleString()} players
        </span>
      </div>

      <div className="mt-3 h-24" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={tiers}
            margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
            barCategoryGap={3}
          >
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelStyle={{ color: '#a1a1aa' }}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />
            <XAxis dataKey="tier" tick={chartAxisTick} axisLine={false} tickLine={false} />
            <Bar dataKey="count" radius={[2, 2, 0, 0]} fill={color} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-white/[0.06] pt-3 font-mono text-[11px]">
        {(
          [
            ['avg rr', data.averageRating],
            ['median', data.medianRating],
            ['banned', data.banned.toLocaleString()],
            ['linked', data.linked.toLocaleString()],
          ] satisfies Array<readonly [string, string | number]>
        ).map(([label, value]) => (
          <StatRow key={label} label={label} value={value} />
        ))}
      </dl>
    </div>
  )
}

export function StatsPage() {
  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    staleTime: 300_000,
  })

  if (stats.isPending) return <LoadingState label="Reading aggregates" />
  if (stats.isError) return <ErrorState error={stats.error} />

  const data = stats.data
  const history = data.history
  const points = (key: 'players' | 'anonymous' | 'nameChanges' | 'regionChanges'): SignalPoint[] =>
    history.map((entry) => ({
      at: entry.at,
      full: fullDate(entry.at),
      value: entry[key],
    }))
  const current = (key: 'players' | 'anonymous' | 'nameChanges' | 'regionChanges') =>
    history.at(-1)?.[key] ?? 0
  const peak = (key: 'players' | 'anonymous' | 'nameChanges' | 'regionChanges') =>
    Math.max(...history.map((entry) => entry[key]), 0)

  const closeRange =
    history.length > 1 && (history.at(-1)?.at ?? 0) - (history[0]?.at ?? 0) < 86_400_000
  const tickFormatter = closeRange ? axisTime : axisDate

  const signals = [
    {
      title: 'Players',
      note: 'Public index size at each completed scan.',
      color: chartColors.players,
      key: 'players' as const,
      kind: 'area' as const,
    },
    {
      title: 'Anonymous',
      note: 'Unresolved leaderboard rows waiting for an exact fingerprint.',
      color: chartColors.anonymous,
      key: 'anonymous' as const,
      kind: 'area' as const,
    },
    {
      title: 'Renames',
      note: 'Name intervals that ended in that scan. An event count, not a total.',
      color: chartColors.renames,
      key: 'nameChanges' as const,
      kind: 'bar' as const,
    },
    {
      title: 'Region moves',
      note: 'Verified transfers. Rare by nature; this panel has its own scale.',
      color: chartColors.moves,
      key: 'regionChanges' as const,
      kind: 'bar' as const,
    },
  ]

  const magnitude = [
    { label: 'players', value: data.totals.players, color: chartColors.players },
    { label: 'anonymous', value: data.coverage.unresolved, color: chartColors.anonymous },
    { label: 'renames', value: data.totals.nameChanges, color: chartColors.renames },
    { label: 'region moves', value: data.totals.regionChanges, color: chartColors.moves },
  ]
  const maxLog = Math.log10(Math.max(...magnitude.map((row) => row.value), 1) + 1)

  return (
    <div className="mx-auto h-full w-full max-w-6xl overflow-y-auto px-5 py-9 sm:px-6">
      <header className="max-w-3xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
          Ladder aggregates
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-50 text-balance">
          The shape of the ladder, over time.
        </h1>
        <p className="mt-4 text-sm leading-6 text-zinc-400">
          These are aggregates from public competitive leaderboards. We keep player histories, not
          per-player rank history; every scan is one observation point.
        </p>
      </header>

      <MetricGrid
        className="mt-8 sm:grid-cols-4 lg:grid-cols-8"
        items={[
          ['players', data.totals.players],
          ['banned', data.totals.banned],
          ['renames', data.totals.nameChanges],
          ['region moves', data.totals.regionChanges],
          ['bans seen', data.totals.bans],
          ['unbans', data.totals.unbans],
          ['linked anon', data.totals.linked],
          ['unresolved', data.totals.unresolved],
        ]}
      />

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">Signals</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Four series with independent scales. Hover a point for the exact observation.
            </p>
          </div>
          <p className="font-mono text-[10px] text-zinc-600">
            {history.length} {history.length === 1 ? 'scan' : 'scans'} observed
          </p>
        </div>

        <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2">
          {signals.map((signal) => (
            <SignalCard
              key={signal.key}
              title={signal.title}
              note={signal.note}
              color={signal.color}
              kind={signal.kind}
              value={current(signal.key)}
              peak={peak(signal.key)}
              tickFormatter={tickFormatter}
              change={
                history.length > 1
                  ? delta(history[0]?.[signal.key] ?? 0, current(signal.key))
                  : 'no history'
              }
              data={points(signal.key)}
            />
          ))}
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Panel
          title="Magnitude"
          description="Bar width is log10(value + 1), so rare signals stay visible next to the ladder."
        >
          <div className="mt-5 space-y-4">
            {magnitude.map((row) => {
              const pct = Math.max(0, (Math.log10(row.value + 1) / maxLog) * 100)
              return (
                <div
                  key={row.label}
                  className="grid grid-cols-[104px_minmax(0,1fr)_58px] items-center gap-3"
                >
                  <span className="font-mono text-[11px] uppercase tracking-wide text-zinc-500">
                    {row.label}
                  </span>
                  <Meter value={pct} aria-label={`${row.label}: ${row.value.toLocaleString()}`}>
                    <MeterTrack className="h-1.5 overflow-hidden rounded bg-white/[0.06]">
                      <MeterIndicator className="h-full" style={{ backgroundColor: row.color }} />
                    </MeterTrack>
                  </Meter>
                  <span className="text-right font-mono text-[11px] text-zinc-300 tabular-nums">
                    {row.value.toLocaleString()}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="mt-4 font-mono text-[10px] leading-5 text-zinc-600">
            players &gt; anonymous &gt; renames &gt; region moves. The log scale keeps the order
            readable without flattening rare events to zero width.
          </p>
        </Panel>

        <CoveragePanel
          linked={data.coverage.linked}
          unresolved={data.coverage.unresolved}
          ratio={data.coverage.ratio}
        />
      </div>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">
              By region
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Rating and tier aggregates come from the latest leaderboard snapshot. Player counts
              include banned players; the public index excludes them.
            </p>
          </div>
          <p className="font-mono text-[10px] text-zinc-600">
            {data.totals.runs.toLocaleString()} {data.totals.runs === 1 ? 'scan' : 'scans'} observed
          </p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {Object.entries(data.regions).map(([region, regionData]) => (
            <RegionCard key={region} region={region} data={regionData} />
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-3">
        <Panel title="Recent renames" description="The most recent name intervals that ended.">
          <RecentList
            empty="No renames recorded."
            rows={data.recent.names.map((row, index) => ({
              key: `${row.puuid}-${index}`,
              puuid: row.puuid,
              label: (
                <>
                  {row.name}
                  <span className="text-zinc-500">#{row.tag}</span>
                </>
              ),
              meta: formatRelative(row.endedAt),
            }))}
          />
        </Panel>

        <Panel
          title="Recent region moves"
          description="Transfers are only recorded when one region claims a player in a scan."
        >
          <RecentList
            empty="No region moves recorded."
            rows={data.recent.regions.map((row, index) => ({
              key: `${row.puuid}-${index}`,
              puuid: row.puuid,
              label: (
                <>
                  {row.name ?? row.puuid.slice(0, 12)}
                  {row.tag ? <span className="text-zinc-500">#{row.tag}</span> : null}
                </>
              ),
              meta: `${regionLabel(row.region)} · ${formatRelative(row.endedAt)}`,
            }))}
          />
        </Panel>

        <Panel title="Most changed" description="Lifetime counters, not a recent window.">
          <RecentList
            empty="No changes recorded."
            rows={data.mostChanged.map((row) => ({
              key: row.puuid,
              puuid: row.puuid,
              label: (
                <>
                  {row.name ?? 'Anonymous'}
                  {row.tag ? <span className="text-zinc-500">#{row.tag}</span> : null}
                </>
              ),
              meta: `${row.nameChanges}n · ${row.regionChanges}r`,
            }))}
          />
        </Panel>
      </section>
    </div>
  )
}
