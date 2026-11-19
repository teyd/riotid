import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'

import { Badge, ErrorState, Section } from '../components/ui.tsx'
import { fetchStats, formatRelative, regionLabel, type SiteStats } from '../lib/api.ts'

export const Route = createFileRoute('/stats')({
  component: StatsPage,
})

const Card = ({ label, value, hint }: { label: string; value: string | number; hint?: string }) => (
  <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
    <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">{label}</p>
    <p className="mt-1 text-xl font-semibold tracking-tight text-zinc-100">
      {typeof value === 'number' ? value.toLocaleString() : value}
    </p>
    {hint ? <p className="mt-0.5 font-mono text-[9px] text-zinc-600">{hint}</p> : null}
  </div>
)

const RegionCard = ({ region, data }: { region: string; data: SiteStats['regions'][string] }) => {
  const tiers = Object.entries(data.tiers)
    .map(([tier, count]) => ({ tier: Number(tier), count }))
    .sort((left, right) => right.tier - left.tier)
    .slice(0, 6)

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-100">{regionLabel(region)}</h3>
        <Badge>{region.toUpperCase()}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[10px]">
        {[
          ['players', data.players.toLocaleString()],
          ['banned', data.banned.toLocaleString()],
          ['avg rr', data.averageRating],
          ['median rr', data.medianRating],
          ['top rr', data.topRating.toLocaleString()],
          ['wins', data.totalWins.toLocaleString()],
          ['linked anon', data.linked.toLocaleString()],
          ['unresolved', data.unresolved.toLocaleString()],
        ].map(([label, value]) => (
          <div key={String(label)} className="flex justify-between gap-2">
            <span className="text-zinc-600">{label}</span>
            <span className="text-zinc-300">{value}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-1">
        {tiers.map((tier) => {
          const max = Math.max(...tiers.map((item) => item.count), 1)
          return (
            <div key={tier.tier} className="flex items-center gap-2 font-mono text-[9px]">
              <span className="w-6 text-right text-zinc-600">T{tier.tier}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-white/5">
                <div
                  className="h-full rounded bg-accent/70"
                  style={{ width: `${(tier.count / max) * 100}%` }}
                />
              </div>
              <span className="w-10 text-right text-zinc-500">{tier.count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatsPage() {
  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    staleTime: 300_000,
  })

  if (stats.isPending) return <Section title="Loading">Reading aggregates…</Section>
  if (stats.isError) return <ErrorState error={stats.error} />

  const data = stats.data

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">aggregates</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Ladder statistics</h1>
        </div>
        <p className="font-mono text-[10px] text-zinc-600">
          anonymous coverage {(data.coverage.ratio * 100).toFixed(1)}% ·{' '}
          {data.totals.runs.toLocaleString()} runs
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Card label="players" value={data.totals.players} />
        <Card label="banned" value={data.totals.banned} />
        <Card label="name changes" value={data.totals.nameChanges} />
        <Card label="region changes" value={data.totals.regionChanges} />
        <Card label="bans" value={data.totals.bans} />
        <Card label="unbans" value={data.totals.unbans} />
        <Card label="linked anon" value={data.totals.linked} />
        <Card label="unresolved" value={data.totals.unresolved} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(data.regions).map(([region, regionData]) => (
          <RegionCard key={region} region={region} data={regionData} />
        ))}
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            Recent renames
          </h2>
          <div className="mt-3 divide-y divide-white/[0.04]">
            {data.recent.names.length === 0 ? (
              <p className="text-xs text-zinc-600">No renames recorded.</p>
            ) : (
              data.recent.names.map((row, index) => (
                <Link
                  key={`${row.puuid}-${index}`}
                  to="/"
                  search={{ p: row.puuid }}
                  className="flex items-baseline justify-between gap-3 py-1.5 hover:text-zinc-100"
                >
                  <span className="truncate text-xs text-zinc-300">
                    {row.name}
                    <span className="text-zinc-600">#{row.tag}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[9px] text-zinc-600">
                    {formatRelative(row.endedAt)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            Recent region moves
          </h2>
          <div className="mt-3 divide-y divide-white/[0.04]">
            {data.recent.regions.length === 0 ? (
              <p className="text-xs text-zinc-600">No region moves recorded.</p>
            ) : (
              data.recent.regions.map((row, index) => (
                <Link
                  key={`${row.puuid}-${index}`}
                  to="/"
                  search={{ p: row.puuid }}
                  className="flex items-baseline justify-between gap-3 py-1.5"
                >
                  <span className="font-mono text-[10px] text-zinc-400">
                    {row.puuid.slice(0, 12)}…
                  </span>
                  <span className="font-mono text-[9px] text-zinc-600">
                    {regionLabel(row.region)} · {formatRelative(row.endedAt)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            Most changed
          </h2>
          <div className="mt-3 divide-y divide-white/[0.04]">
            {data.mostChanged.map((row) => (
              <Link
                key={row.puuid}
                to="/"
                search={{ p: row.puuid }}
                className="flex items-baseline justify-between gap-3 py-1.5"
              >
                <span className="truncate text-xs text-zinc-300">
                  {row.name ?? 'Anonymous'}
                  {row.tag ? <span className="text-zinc-600">#{row.tag}</span> : null}
                </span>
                <span className="shrink-0 font-mono text-[9px] text-zinc-600">
                  {row.nameChanges}n · {row.regionChanges}r
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
