import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
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
import { MetricGrid, Panel, StatRow } from '../components/panel.tsx'
import { ErrorState, LoadingState } from '../components/ui.tsx'
import { fetchStats, formatDate, formatRelative, regionLabel, type SiteStats } from '../lib/api.ts'

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

      <div className="mt-3 h-24">
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

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-white/[0.06] pt-3 font-mono text-[10px]">
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
  const history = data.history.map((entry) => ({
    ...entry,
    label: formatDate(entry.at),
  }))

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

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel
          title="Scan activity"
          description="One point per completed scan. Left axis is ladder size; right axis is churn."
        >
          <div className="mt-4 h-64">
            {history.length === 0 ? (
              <p className="text-sm text-zinc-600">No completed scans yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={chartAxisTick}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={36}
                  />
                  <YAxis yAxisId="left" tick={chartAxisTick} axisLine={false} tickLine={false} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={chartAxisTick}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={{ color: '#a1a1aa' }}
                    itemStyle={{ padding: 0 }}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="players"
                    name="players"
                    stroke={chartColors.players}
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="nameChanges"
                    name="renames"
                    stroke={chartColors.renames}
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="regionChanges"
                    name="region moves"
                    stroke={chartColors.moves}
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="anonymous"
                    name="anonymous"
                    stroke={chartColors.anonymous}
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-zinc-500">
            {[
              ['players', chartColors.players],
              ['renames', chartColors.renames],
              ['region moves', chartColors.moves],
              ['anonymous', chartColors.anonymous],
            ].map(([label, color]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
                {label}
              </span>
            ))}
          </div>
        </Panel>

        <Panel
          title="Identity coverage"
          description="Only exact match-graph fingerprints become links."
        >
          <div className="mt-4">
            <Donut
              data={[
                { name: 'linked', value: data.coverage.linked, color: chartColors.players },
                { name: 'unresolved', value: data.coverage.unresolved, color: chartColors.muted },
              ]}
              centerValue={`${(data.coverage.ratio * 100).toFixed(1)}%`}
              centerLabel="linked"
            />
          </div>
          <dl className="mt-2 space-y-1.5 border-t border-white/[0.06] pt-3 font-mono text-[10px]">
            <StatRow label="linked rows" value={data.coverage.linked} />
            <StatRow label="unresolved rows" value={data.coverage.unresolved} muted />
          </dl>
        </Panel>
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
          <div className="mt-2 divide-y divide-white/[0.05]">
            {data.recent.names.length === 0 ? (
              <p className="py-3 text-sm text-zinc-600">No renames recorded.</p>
            ) : (
              data.recent.names.map((row, index) => (
                <Link
                  key={`${row.puuid}-${index}`}
                  to="/puuid/$puuid"
                  params={{ puuid: row.puuid }}
                  className="flex items-baseline justify-between gap-3 py-2.5 hover:text-zinc-100"
                >
                  <span className="truncate text-sm text-zinc-300">
                    {row.name}
                    <span className="text-zinc-600">#{row.tag}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                    {formatRelative(row.endedAt)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </Panel>

        <Panel
          title="Recent region moves"
          description="Transfers are only recorded when one region claims a player in a scan."
        >
          <div className="mt-2 divide-y divide-white/[0.05]">
            {data.recent.regions.length === 0 ? (
              <p className="py-3 text-sm text-zinc-600">No region moves recorded.</p>
            ) : (
              data.recent.regions.map((row, index) => (
                <Link
                  key={`${row.puuid}-${index}`}
                  to="/puuid/$puuid"
                  params={{ puuid: row.puuid }}
                  className="flex items-baseline justify-between gap-3 py-2.5"
                >
                  <span className="truncate text-sm text-zinc-300">
                    {row.name ?? row.puuid.slice(0, 12)}
                    {row.tag ? <span className="text-zinc-600">#{row.tag}</span> : null}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {regionLabel(row.region)} · {formatRelative(row.endedAt)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </Panel>

        <Panel title="Most changed" description="Lifetime counters, not a recent window.">
          <div className="mt-2 divide-y divide-white/[0.05]">
            {data.mostChanged.map((row) => (
              <Link
                key={row.puuid}
                to="/puuid/$puuid"
                params={{ puuid: row.puuid }}
                className="flex items-baseline justify-between gap-3 py-2.5"
              >
                <span className="truncate text-sm text-zinc-300">
                  {row.name ?? 'Anonymous'}
                  {row.tag ? <span className="text-zinc-600">#{row.tag}</span> : null}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                  {row.nameChanges}n · {row.regionChanges}r
                </span>
              </Link>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  )
}
