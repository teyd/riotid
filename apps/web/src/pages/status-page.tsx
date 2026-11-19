import { useQuery } from '@tanstack/react-query'
import {
  Waterfall,
  WaterfallAxis,
  WaterfallBar,
  WaterfallCell,
  WaterfallColumnHeader,
  WaterfallHeaderRow,
  WaterfallRow,
  WaterfallRowHeader,
} from '@ui-sdk/react/waterfall'

import { Donut, chartColors } from '../components/charts.tsx'
import { MetricGrid, Panel, StatRow } from '../components/panel.tsx'
import { ErrorState, LoadingState } from '../components/ui.tsx'
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
  <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-white/[0.05] py-2.5 last:border-0">
    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">{label}</span>
    <span className="font-mono text-[11px] text-zinc-200">
      {value}
      {hint ? <span className="mt-0.5 block break-all text-zinc-600">{hint}</span> : null}
    </span>
  </div>
)

const statusColor: Record<string, string> = {
  succeeded: '#4ade80',
  failed: '#fbbf24',
  running: '#38bdf8',
}

const formatAxis = (ms: number): string =>
  ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)}m`

export function StatusPage() {
  const status = useQuery({
    queryKey: ['status'],
    queryFn: fetchStatus,
    refetchInterval: 30_000,
    staleTime: 10_000,
  })

  if (status.isPending) return <LoadingState label="Checking readiness" />
  if (status.isError) return <ErrorState error={status.error} />

  const data = status.data

  const runs = [...data.recentRuns].reverse()
  const base = runs[0]?.startedAt ?? 0
  const items = runs.map((run) => ({
    value: `run-${run.id}`,
    label: `#${run.id} · ${run.trigger}`,
    start: Math.max(0, run.startedAt - base),
    duration: Math.max(
      1000,
      run.durationMs ?? (run.finishedAt ? run.finishedAt - run.startedAt : 1000),
    ),
  }))

  return (
    <div className="mx-auto h-full w-full max-w-6xl overflow-y-auto px-5 py-9 sm:px-6">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">Readiness</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">System status</h1>
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-zinc-400">
            <span className={`size-1.5 rounded-full ${data.ok ? 'bg-[#4ade80]' : 'bg-zinc-500'}`} />
            {data.ok ? 'operational' : 'degraded'}
          </span>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400">
          The public API is read-only and never calls Riot. Scans refresh the index; the identity
          pass and backups run on their own schedules.
        </p>
      </header>

      <MetricGrid
        className="mt-8 sm:grid-cols-4"
        items={[
          ['api uptime', formatDuration(data.uptimeSeconds)],
          ['index players', data.index.players],
          ['linked rows', data.anonymous.linked],
          ['last backup', data.lastBackupAt ? formatRelative(data.lastBackupAt) : 'not yet'],
        ]}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel
          title="Pipeline runs"
          meta={`${data.recentRuns.length} recent`}
          description="Each bar is one completed or running scan, placed on a shared clock."
        >
          <div className="mt-4">
            {items.length === 0 ? (
              <p className="py-3 text-sm text-zinc-600">No scans recorded yet.</p>
            ) : (
              <Waterfall
                aria-label="Recent pipeline runs"
                items={items}
                format={formatAxis}
                className="waterfall"
              >
                <WaterfallHeaderRow>
                  <WaterfallColumnHeader>run</WaterfallColumnHeader>
                  <WaterfallColumnHeader>duration</WaterfallColumnHeader>
                  <WaterfallColumnHeader aria-label="Timeline">
                    <WaterfallAxis maxTicks={5} />
                  </WaterfallColumnHeader>
                </WaterfallHeaderRow>
                {items.map((item) => {
                  const run = runs.find((entry) => `run-${entry.id}` === item.value)
                  return (
                    <WaterfallRow key={item.value} value={item.value}>
                      <WaterfallRowHeader>{item.label}</WaterfallRowHeader>
                      <WaterfallCell className="text-right">
                        {Math.round(item.duration / 1000)}s
                      </WaterfallCell>
                      <WaterfallBar
                        style={{
                          ['--wf-color' as string]: statusColor[run?.status ?? ''] ?? '#52525b',
                        }}
                      />
                    </WaterfallRow>
                  )
                })}
              </Waterfall>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-zinc-500">
            {[
              ['succeeded', statusColor.succeeded],
              ['failed', statusColor.failed],
              ['running', statusColor.running],
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
          description="Anonymized rows linked by an exact match-graph fingerprint."
        >
          <div className="mt-4">
            <Donut
              data={[
                { name: 'linked', value: data.anonymous.linked, color: chartColors.players },
                {
                  name: 'unresolved',
                  value: data.anonymous.unresolved,
                  color: chartColors.muted,
                },
              ]}
              centerValue={`${((data.anonymous.linked / Math.max(1, data.anonymous.total)) * 100).toFixed(1)}%`}
              centerLabel="linked"
            />
          </div>
          <dl className="mt-2 space-y-1.5 border-t border-white/[0.06] pt-3 font-mono text-[10px]">
            <StatRow label="observed rows" value={data.anonymous.total} />
            <StatRow label="unresolved" value={data.anonymous.unresolved} muted />
          </dl>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Runtime" description="API process, SQLite file, and public index.">
          <div className="mt-2">
            <Row label="api uptime" value={formatDuration(data.uptimeSeconds)} />
            <Row
              label="database"
              value={data.database.ok ? 'open · read-only' : 'unavailable'}
              hint={data.database.path}
            />
            <Row
              label="index"
              value={`v${data.index.version} · ${data.index.players.toLocaleString()} players`}
            />
            <Row
              label="season"
              value={data.season?.name ?? 'none'}
              hint={data.season ? `ends ${formatDateTime(data.season.endsAt)}` : undefined}
            />
          </div>
        </Panel>

        <Panel title="Pipeline" description="Scans, identity resolution, and backup rotation.">
          <div className="mt-2">
            <Row
              label="latest scan"
              value={
                data.latestRun
                  ? `#${data.latestRun.id} ${data.latestRun.status} · ${data.latestRun.trigger}`
                  : 'none'
              }
              hint={
                data.latestRun?.finishedAt
                  ? `${formatRelative(data.latestRun.finishedAt)} · ${Math.round((data.latestRun.durationMs ?? 0) / 1000)}s`
                  : undefined
              }
            />
            <Row
              label="identity pass"
              value={data.lastAnonRunAt ? formatRelative(data.lastAnonRunAt) : 'not run yet'}
              hint={data.lastAnonRunAt ? formatDateTime(data.lastAnonRunAt) : 'daily scheduler'}
            />
            <Row
              label="last backup"
              value={data.lastBackupAt ? formatRelative(data.lastBackupAt) : 'not created yet'}
              hint={data.lastBackupAt ? formatDateTime(data.lastBackupAt) : 'daily rotation'}
            />
          </div>
        </Panel>

        <Panel title="Riot auth" description="Long-lived jar on the data volume.">
          <div className="mt-2">
            <Row
              label="cookie jar"
              value={data.auth.updatedAt ? formatRelative(data.auth.updatedAt) : 'missing'}
              hint={data.auth.cookieFile}
            />
            <Row label="refresh" value="45 minutes" hint="QR login only when the jar expires" />
            <Row
              label="public index"
              value={`${data.index.players.toLocaleString()} players`}
              hint="banned and unresolved excluded"
            />
          </div>
        </Panel>
      </div>

      <p className="mt-6 font-mono text-[10px] leading-5 text-zinc-600">
        Unofficial fan project · not affiliated with Riot Games. Status refreshes every 30 seconds.
      </p>
    </div>
  )
}

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  if (seconds < 86_400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86_400)}d`
}
