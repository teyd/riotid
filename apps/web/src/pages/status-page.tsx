import { useQuery } from '@tanstack/react-query'

import { Badge, ErrorState } from '../components/ui.tsx'
import { fetchStatus, formatDateTime, formatRelative } from '../lib/api.ts'

const Row = ({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string | undefined
}) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.04] py-3 last:border-0">
    <span className="font-mono text-[11px] uppercase tracking-wide text-zinc-500">{label}</span>
    <span className="text-right font-mono text-xs text-zinc-300">
      {value}
      {hint ? <span className="ml-2 text-zinc-600">{hint}</span> : null}
    </span>
  </div>
)

export function StatusPage() {
  const status = useQuery({
    queryKey: ['status'],
    queryFn: fetchStatus,
    refetchInterval: 30_000,
    staleTime: 10_000,
  })

  if (status.isPending) {
    return <div className="p-6 font-mono text-xs text-zinc-500">Checking readiness…</div>
  }

  if (status.isError) return <ErrorState error={status.error} />

  const data = status.data

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-5 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">readiness</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Service status</h1>
        </div>
        <Badge tone={data.ok ? 'accent' : 'warn'}>{data.ok ? 'operational' : 'degraded'}</Badge>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-5 py-3">
          <Row
            label="api"
            value={data.ok ? 'ok' : 'error'}
            hint={`up ${Math.floor(data.uptimeSeconds / 60)}m`}
          />
          <Row
            label="database"
            value={data.database.ok ? 'ok' : 'error'}
            hint={data.database.path}
          />
          <Row
            label="index"
            value={`v${data.index.version}`}
            hint={`${data.index.players.toLocaleString()} players`}
          />
          <Row
            label="season"
            value={data.season?.name ?? '—'}
            hint={data.season ? `ends ${formatDateTime(data.season.endsAt)}` : undefined}
          />
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-5 py-3">
          <Row
            label="latest run"
            value={data.latestRun ? `#${data.latestRun.id} ${data.latestRun.status}` : '—'}
            hint={
              data.latestRun?.finishedAt
                ? `${formatRelative(data.latestRun.finishedAt)} · ${Math.round((data.latestRun.durationMs ?? 0) / 1000)}s`
                : undefined
            }
          />
          <Row
            label="cookie jar"
            value={data.auth.updatedAt ? formatRelative(data.auth.updatedAt) : 'missing'}
          />
          <Row
            label="anonymous"
            value={`${data.anonymous.unresolved.toLocaleString()} unresolved`}
            hint={`${data.anonymous.linked.toLocaleString()} linked`}
          />
          <Row label="request id" value={status.data ? 'ok' : '—'} />
        </div>
      </div>

      <p className="mt-6 font-mono text-xs leading-6 text-zinc-500">
        Data freshness follows the scan scheduler. The API is read-only and never calls Riot. Cookie
        jar path: {data.auth.cookieFile}.
      </p>
    </div>
  )
}
