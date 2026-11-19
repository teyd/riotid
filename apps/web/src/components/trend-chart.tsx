import { useMemo, useState } from 'react'

import { formatDate, type SiteStats } from '../lib/api.ts'

type Metric = 'players' | 'nameChanges' | 'regionChanges' | 'anonymous'

const metrics: Array<{ key: Metric; label: string }> = [
  { key: 'players', label: 'Players' },
  { key: 'nameChanges', label: 'Name changes' },
  { key: 'regionChanges', label: 'Region moves' },
  { key: 'anonymous', label: 'Anonymous' },
]

const width = 720
const height = 220
const padX = 4
const padTop = 14
const padBottom = 26

export const TrendChart = ({ history }: { history: SiteStats['history'] }) => {
  const [metric, setMetric] = useState<Metric>('players')

  const { points, area, values, latest, change } = useMemo(() => {
    const series = history.map((entry) => ({ at: entry.at, value: entry[metric] }))
    const numbers = series.map((entry) => entry.value)
    const max = Math.max(...numbers, 1)
    const min = Math.min(...numbers, 0)
    const spread = max - min || max || 1
    const padding = spread * 0.18
    const domainMin = Math.max(0, min - padding)
    const domainMax = max + padding
    const range = domainMax - domainMin || 1
    const innerWidth = width - padX * 2
    const innerHeight = height - padTop - padBottom

    const mapped = series.map((entry, index) => {
      const x =
        padX + (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth)
      const y = padTop + innerHeight - ((entry.value - domainMin) / range) * innerHeight
      return { ...entry, x, y }
    })

    const path = mapped.map((point) => `${point.x},${point.y}`).join(' ')
    const first = mapped[0]
    const last = mapped[mapped.length - 1]

    return {
      points: mapped,
      area:
        mapped.length > 1 && first && last
          ? `${padX},${padTop + innerHeight} ${path} ${last.x},${padTop + innerHeight}`
          : '',
      values: numbers,
      latest: last?.value ?? 0,
      change: (last?.value ?? 0) - (first?.value ?? 0),
    }
  }, [history, metric])

  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">Scan activity</p>
        <p className="mt-3 text-sm text-zinc-500">No completed scans yet.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">
            Scan activity
          </p>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-3xl font-semibold tracking-tight text-zinc-50">
              {latest.toLocaleString()}
            </span>
            <span className="font-mono text-xs text-zinc-500">
              {change === 0
                ? 'flat'
                : `${change > 0 ? '+' : ''}${change.toLocaleString()} across window`}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/[0.08] p-1">
          {metrics.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setMetric(item.key)}
              data-active={metric === item.key}
              className="rounded-md px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-200 data-[active=true]:bg-white/10 data-[active=true]:text-zinc-100"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-5 h-56 w-full overflow-visible"
        role="img"
        aria-label={`${metrics.find((item) => item.key === metric)?.label} over the last ${history.length} scans`}
      >
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={padX}
            x2={width - padX}
            y1={padTop + (height - padTop - padBottom) * fraction}
            y2={padTop + (height - padTop - padBottom) * fraction}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
        ))}

        {area ? <polygon points={area} fill="rgba(74,222,128,0.10)" /> : null}
        {points.length > 1 ? (
          <polyline
            points={points.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke="#4ade80"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}

        {points.map((point) => (
          <circle key={point.at} cx={point.x} cy={point.y} r="3.5" fill="#4ade80">
            <title>
              {formatDate(point.at)} · {point.value.toLocaleString()}
            </title>
          </circle>
        ))}

        <text
          x={padX}
          y={height - 6}
          fill="rgba(255,255,255,0.35)"
          fontSize="11"
          fontFamily="monospace"
        >
          {formatDate(history[0]?.at ?? null)}
        </text>
        <text
          x={width - padX}
          y={height - 6}
          textAnchor="end"
          fill="rgba(255,255,255,0.35)"
          fontSize="11"
          fontFamily="monospace"
        >
          {formatDate(history[history.length - 1]?.at ?? null)}
        </text>
      </svg>

      <p className="mt-1 font-mono text-[10px] text-zinc-600">
        {values.length} scans · min {Math.min(...values).toLocaleString()} · max{' '}
        {Math.max(...values).toLocaleString()}
      </p>
    </div>
  )
}
