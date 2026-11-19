import { Toolbar, ToolbarButton } from '@ui-sdk/react/toolbar'
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
import { useState } from 'react'

import { Donut, chartColors } from '../components/charts.tsx'
import { JsonCode, type JsonValue } from '../components/json-code.tsx'
import { Panel, StatRow } from '../components/panel.tsx'
import { ErrorState, LoadingState } from '../components/ui.tsx'
import { fetchStatus, formatDateTime, formatRelative } from '../lib/api.ts'

const statusColor: Record<string, string> = {
  succeeded: '#4ade80',
  failed: '#fbbf24',
  running: '#38bdf8',
}

const formatAxis = (ms: number): string =>
  ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)}m`

const explanations: Record<string, string> = {
  uptime: 'Time since the API process started. The process is stateless; SQLite holds the data.',
  'database.path': 'The SQLite file on the data volume. The public API opens it read-only.',
  'index.version': 'Bumped whenever the public index is rebuilt from the database.',
  'index.players':
    'Players in the public index. Banned players and unresolved anonymous rows are excluded.',
  'pipeline.lastScan':
    'The latest leaderboard crawl. Each scan is one observation point for every tracked player.',
  'pipeline.lastCrawler':
    'The continuous identity pass. It pauses for scans and spends the daily Riot request budget.',
  'pipeline.lastBackup': 'The latest rotated SQLite backup on the data volume.',
  coverage: 'Only an exact match-graph fingerprint becomes a link. Ambiguous rows stay unresolved.',
  'coverage.linked': 'Rows resolved with exact rank, rating, wins, tier, and a shared match.',
  'coverage.unresolved': 'Rows still waiting for an exact fingerprint.',
  'coverage.ratio': 'Linked anonymous rows divided by all observed anonymous rows.',
  'auth.cookieJar': 'The long-lived Riot cookie jar. It refreshes every 45 minutes.',
  'auth.refresh': 'QR login is only needed when the cookie jar expires.',
}

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  if (seconds < 86_400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86_400)}d`
}

export function StatusPage() {
  const status = useQuery({
    queryKey: ['status'],
    queryFn: fetchStatus,
    refetchInterval: 30_000,
    staleTime: 10_000,
  })
  const [copied, setCopied] = useState(false)

  if (status.isPending) return <LoadingState label="Checking readiness" />
  if (status.isError) return <ErrorState error={status.error} />

  const data = status.data
  const ratio = data.anonymous.linked / Math.max(1, data.anonymous.total)
  const json: Record<string, JsonValue> = {
    ok: data.ok,
    uptime: formatDuration(data.uptimeSeconds),
    database: { ok: data.database.ok, path: data.database.path },
    index: { version: data.index.version, players: data.index.players },
    season: data.season
      ? { name: data.season.name, endsAt: formatDateTime(data.season.endsAt) }
      : null,
    pipeline: {
      lastScan: data.latestRun
        ? {
            id: data.latestRun.id,
            status: data.latestRun.status,
            trigger: data.latestRun.trigger,
            finishedAt: data.latestRun.finishedAt
              ? formatRelative(data.latestRun.finishedAt)
              : null,
            duration: data.latestRun.durationMs
              ? `${Math.round(data.latestRun.durationMs / 1000)}s`
              : null,
          }
        : null,
      lastCrawler: data.lastAnonRunAt ? formatRelative(data.lastAnonRunAt) : null,
      lastBackup: data.lastBackupAt ? formatRelative(data.lastBackupAt) : null,
    },
    coverage: {
      linked: data.anonymous.linked,
      unresolved: data.anonymous.unresolved,
      total: data.anonymous.total,
      ratio: `${(ratio * 100).toFixed(2)}%`,
    },
    auth: {
      cookieJar: data.auth.updatedAt ? formatRelative(data.auth.updatedAt) : 'missing',
      refresh: '45 minutes',
    },
  }

  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(json, null, 2))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

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
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-50 text-balance">
            System status
          </h1>
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-zinc-400">
            <span className={`size-1.5 rounded-full ${data.ok ? 'bg-[#4ade80]' : 'bg-zinc-500'}`} />
            {data.ok ? 'operational' : 'degraded'}
          </span>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400">
          The public API is read-only and never calls Riot. Scans refresh the index; the identity
          pass and backups run on their own schedules.
        </p>
      </header>

      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className="flex flex-col overflow-hidden rounded-lg border border-white/[0.08] bg-[#050505]">
          <header className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] px-4 py-2.5">
            <span className={`size-2 rounded-full ${data.ok ? 'bg-[#4ade80]' : 'bg-zinc-500'}`} />
            <span className="font-mono text-[11px] text-zinc-300">status.json</span>
            <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
              json
            </span>
            <Toolbar aria-label="JSON actions" className="ml-auto">
              <ToolbarButton
                onClick={copy}
                className="font-mono text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-200"
              >
                {copied ? 'copied' : 'copy'}
              </ToolbarButton>
            </Toolbar>
          </header>

          <div className="overflow-x-auto p-4 sm:p-5">
            <JsonCode value={json} explanations={explanations} />
          </div>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-4 py-2.5 font-mono text-[10px] text-zinc-600">
            <span>hover dotted keys for definitions</span>
            <a href="/api/v1/status" className="text-zinc-500 hover:text-zinc-200">
              GET /api/v1/status ↗
            </a>
          </div>
        </section>

        <div className="grid content-start gap-4">
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
                centerValue={`${(ratio * 100).toFixed(1)}%`}
                centerLabel="linked"
              />
            </div>
            <dl className="mt-2 space-y-1.5 border-t border-white/[0.06] pt-3 font-mono text-[11px]">
              <StatRow label="observed rows" value={data.anonymous.total} />
              <StatRow label="unresolved" value={data.anonymous.unresolved} muted />
            </dl>
          </Panel>

          <Panel
            title="Pipeline runs"
            meta={`${data.recentRuns.length} recent`}
            description="Each bar is one completed or running scan, placed on a shared clock."
          >
            <div className="mt-4">
              {items.length === 0 ? (
                <p className="py-3 text-sm text-zinc-500">No scans recorded yet.</p>
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
        </div>
      </div>

      <p className="mt-6 font-mono text-[10px] leading-5 text-zinc-600">
        Unofficial fan project · not affiliated with Riot Games. Status refreshes every 30 seconds.
      </p>
    </div>
  )
}
