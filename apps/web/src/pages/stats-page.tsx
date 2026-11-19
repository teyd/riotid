import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Meter, MeterIndicator, MeterLabel, MeterTrack, MeterValue } from '@ui-sdk/react/meter'

import { TrendChart } from '../components/trend-chart.tsx'
import { ErrorState, LoadingState } from '../components/ui.tsx'
import { fetchStats, formatRelative, regionLabel, type SiteStats } from '../lib/api.ts'

const NumberCell = ({ label, value }: { label: string; value: string | number }) => (
  <div className="border-l border-white/[0.07] pl-4 first:border-0 first:pl-0">
    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
    <p className="mt-1.5 text-2xl font-semibold tracking-tight text-zinc-100 tabular-nums">
      {typeof value === 'number' ? value.toLocaleString() : value}
    </p>
  </div>
)

const RegionRow = ({ region, data }: { region: string; data: SiteStats['regions'][string] }) => {
  const tiers = Object.entries(data.tiers)
    .map(([tier, count]) => ({ tier: Number(tier), count }))
    .sort((left, right) => right.tier - left.tier)
    .slice(0, 6)
  const max = Math.max(...tiers.map((tier) => tier.count), 1)

  return (
    <div className="grid gap-5 py-6 lg:grid-cols-[180px_1fr_1fr_1fr]">
      <div>
        <h3 className="text-base font-medium text-zinc-100">{regionLabel(region)}</h3>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
          {region} affinity
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-5 gap-y-2 font-mono text-[11px]">
        {[
          ['players', data.players.toLocaleString()],
          ['banned', data.banned.toLocaleString()],
          ['linked anon', data.linked.toLocaleString()],
          ['unresolved', data.unresolved.toLocaleString()],
        ].map(([label, value]) => (
          <div key={String(label)} className="flex justify-between gap-3">
            <dt className="text-zinc-500">{label}</dt>
            <dd className="text-zinc-300 tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <dl className="grid grid-cols-3 gap-x-4 font-mono text-[11px]">
        {[
          ['avg rr', data.averageRating],
          ['median', data.medianRating],
          ['top rr', data.topRating.toLocaleString()],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className="text-zinc-500">{label}</dt>
            <dd className="mt-1 text-sm text-zinc-200 tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-1.5">
        {tiers.map((tier) => (
          <div key={tier.tier} className="flex items-center gap-3 font-mono text-[10px]">
            <span className="w-7 text-right text-zinc-500">T{tier.tier}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded bg-white/[0.06]">
              <div
                className="h-full rounded bg-accent/70"
                style={{ width: `${(tier.count / max) * 100}%` }}
              />
            </div>
            <span className="w-12 text-right text-zinc-400 tabular-nums">{tier.count}</span>
          </div>
        ))}
      </div>
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

  return (
    <div className="mx-auto h-full w-full max-w-6xl overflow-y-auto px-5 py-9 sm:px-6">
      <header className="max-w-3xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
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

      <section className="mt-8 grid grid-cols-2 gap-x-5 gap-y-6 border-y border-white/[0.08] py-6 sm:grid-cols-4 lg:grid-cols-8">
        <NumberCell label="players" value={data.totals.players} />
        <NumberCell label="banned" value={data.totals.banned} />
        <NumberCell label="renames" value={data.totals.nameChanges} />
        <NumberCell label="region moves" value={data.totals.regionChanges} />
        <NumberCell label="bans seen" value={data.totals.bans} />
        <NumberCell label="unbans" value={data.totals.unbans} />
        <NumberCell label="linked anon" value={data.totals.linked} />
        <NumberCell label="unresolved" value={data.totals.unresolved} />
      </section>

      <div className="mt-8">
        <TrendChart history={data.history} />
      </div>

      <section className="mt-8 grid gap-8 border-b border-white/[0.08] pb-8 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">
            Identity coverage
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Anonymized leaderboard rows carry no identity. We link them only when a match-graph MMR
            fingerprint is exact; ambiguous rows stay unresolved. Coverage grows as more matches are
            observed, and never reaches 100% for players who never share a match with a known
            player.
          </p>
        </div>
        <Meter value={Math.round(data.coverage.ratio * 1000) / 10} className="self-center">
          <div className="flex items-baseline justify-between">
            <MeterLabel className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              linked / observed
            </MeterLabel>
            <span className="font-mono text-xs text-zinc-300 tabular-nums">
              {(data.coverage.ratio * 100).toFixed(2)}%
            </span>
          </div>
          <MeterTrack className="mt-2 h-1.5 overflow-hidden rounded bg-white/[0.06]">
            <MeterIndicator className="h-full rounded bg-accent" />
          </MeterTrack>
          <p className="mt-2 font-mono text-[10px] text-zinc-600">
            {data.coverage.linked.toLocaleString()} linked ·{' '}
            {data.coverage.unresolved.toLocaleString()} unresolved
          </p>
        </Meter>
      </section>

      <section className="mt-8">
        <div className="max-w-2xl">
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">By region</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Rating and tier aggregates come from the latest leaderboard snapshot. Player counts
            include banned players; the public index excludes them.
          </p>
        </div>
        <div className="mt-3 divide-y divide-white/[0.07] border-y border-white/[0.08]">
          {Object.entries(data.regions).map(([region, regionData]) => (
            <RegionRow key={region} region={region} data={regionData} />
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-9 lg:grid-cols-3">
        <div>
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">
            Recent renames
          </h2>
          <p className="mt-2 text-xs leading-5 text-zinc-600">
            The most recent name intervals that ended.
          </p>
          <div className="mt-3 divide-y divide-white/[0.05] border-t border-white/[0.07]">
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
        </div>

        <div>
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">
            Recent region moves
          </h2>
          <p className="mt-2 text-xs leading-5 text-zinc-600">
            Transfers are only recorded when one region claims a player in a scan.
          </p>
          <div className="mt-3 divide-y divide-white/[0.05] border-t border-white/[0.07]">
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
        </div>

        <div>
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">
            Most changed
          </h2>
          <p className="mt-2 text-xs leading-5 text-zinc-600">
            Lifetime counters, not a recent window.
          </p>
          <div className="mt-3 divide-y divide-white/[0.05] border-t border-white/[0.07]">
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
        </div>
      </section>
    </div>
  )
}
