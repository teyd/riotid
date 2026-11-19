import { formatDate, type SiteStats } from '../lib/api.ts'

type Metric = 'players' | 'nameChanges' | 'regionChanges' | 'anonymous'

const metrics: Array<{ key: Metric; label: string; description: string }> = [
  { key: 'players', label: 'Players', description: 'tracked in the latest scan' },
  { key: 'nameChanges', label: 'Name changes', description: 'renames observed in the scan' },
  { key: 'regionChanges', label: 'Region moves', description: 'verified region transfers' },
  { key: 'anonymous', label: 'Anonymous', description: 'unresolved leaderboard rows' },
]

const width = 220
const height = 54
const pad = 3

const Sparkline = ({ values }: { values: ReadonlyArray<number> }) => {
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const last = values[values.length - 1] ?? 0
  const first = values[0] ?? 0
  const points = values.map((value, index) => {
    const x =
      values.length === 1 ? width / 2 : pad + (index / (values.length - 1)) * (width - pad * 2)
    const y = pad + (1 - (value - min) / range) * (height - pad * 2)
    return { x, y }
  })
  const path = points.map((point) => `${point.x},${point.y}`).join(' ')

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-semibold tracking-tight text-zinc-100 tabular-nums">
          {last.toLocaleString()}
        </span>
        <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
          {first === last ? 'flat' : `${last > first ? '+' : ''}${(last - first).toLocaleString()}`}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 h-14 w-full"
        role="img"
        aria-label={`${last.toLocaleString()} over ${values.length} scans`}
      >
        <line
          x1="0"
          x2={width}
          y1={height - pad}
          y2={height - pad}
          stroke="rgba(255,255,255,0.07)"
        />
        {points.length > 1 ? (
          <polyline
            points={path}
            fill="none"
            stroke="#4ade80"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {points.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r="2.5" fill="#4ade80" />
        ))}
      </svg>
    </div>
  )
}

export const TrendChart = ({ history }: { history: SiteStats['history'] }) => {
  if (history.length === 0) {
    return (
      <section className="border-y border-white/[0.08] py-8">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">
          Scan activity
        </h2>
        <p className="mt-3 text-sm text-zinc-500">No completed scans yet.</p>
      </section>
    )
  }

  return (
    <section className="border-y border-white/[0.08] py-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">
            Scan activity
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            One point per completed scan, oldest to newest. These are observed counts, not
            extrapolations; a gap means the scheduler was paused.
          </p>
        </div>
        <p className="font-mono text-[10px] text-zinc-600">
          {history.length} {history.length === 1 ? 'scan' : 'scans'} ·{' '}
          {formatDate(history[0]?.at ?? null)} →{' '}
          {formatDate(history[history.length - 1]?.at ?? null)}
        </p>
      </div>

      <div className="mt-6 grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.key}>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              {metric.label}
            </p>
            <Sparkline values={history.map((entry) => entry[metric.key])} />
            <p className="mt-1 text-[11px] leading-5 text-zinc-600">{metric.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
