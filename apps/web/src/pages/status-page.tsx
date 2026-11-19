import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { CodePanel } from '../components/code-panel.tsx'
import { JsonCode, type JsonValue } from '../components/json-code.tsx'
import { CoveragePanel } from '../components/coverage-panel.tsx'
import { Panel } from '../components/panel.tsx'
import { ErrorState, LoadingState } from '../components/ui.tsx'
import { fetchStatus, formatDateTime, formatRelative } from '../lib/api.ts'

const statusColor: Record<string, string> = {
  succeeded: '#4ade80',
  failed: '#fbbf24',
  running: '#38bdf8',
}

const explanations: Record<string, string> = {
  uptime: 'Time since the API process started. The process is stateless; SQLite holds the data.',
  'database.file': 'The SQLite file on the data volume. The public API opens it read-only.',
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
    database: { ok: data.database.ok, file: data.database.file },
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

  const runs = data.recentRuns
  const maxDuration = Math.max(
    ...runs.map((run) => run.durationMs ?? (run.finishedAt ? run.finishedAt - run.startedAt : 0)),
    1,
  )

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
        <CodePanel
          title="status.json"
          dot={data.ok ? 'bg-[#4ade80]' : 'bg-zinc-500'}
          copied={copied}
          onCopy={copy}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-4 py-2.5 font-mono text-[10px] text-zinc-600">
              <span>hover dotted keys for definitions</span>
              <a href="/api/v1/status" className="text-zinc-500 hover:text-zinc-200">
                GET /api/v1/status ↗
              </a>
            </div>
          }
        >
          <div className="overflow-x-auto p-4 sm:p-5">
            <JsonCode value={json} explanations={explanations} />
          </div>
        </CodePanel>

        <div className="grid content-start gap-4">
          <CoveragePanel
            linked={data.anonymous.linked}
            unresolved={data.anonymous.unresolved}
            ratio={ratio}
            total={data.anonymous.total}
          />

          <Panel
            title="Pipeline runs"
            meta={`${data.recentRuns.length} recent`}
            description="Duration of each recent scan; color shows status."
          >
            <div className="mt-3">
              {runs.length === 0 ? (
                <p className="py-3 text-sm text-zinc-500">No scans recorded yet.</p>
              ) : (
                runs.map((run) => {
                  const duration =
                    run.durationMs ?? (run.finishedAt ? run.finishedAt - run.startedAt : 0)
                  const color = statusColor[run.status] ?? '#52525b'
                  return (
                    <div
                      key={run.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-white/[0.05] py-2 first:border-t-0"
                    >
                      <div className="flex min-w-0 items-center gap-2 font-mono text-[11px]">
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="truncate text-zinc-300">
                          #{run.id} · {run.trigger}
                        </span>
                        <span className="shrink-0 text-zinc-600">{run.status}</span>
                      </div>
                      <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
                        {Math.round(duration / 1000)}s
                      </span>
                      <div className="col-span-2 mt-1.5 h-px bg-white/[0.06]">
                        <div
                          className="h-full"
                          style={{
                            width: `${Math.max(1, (duration / maxDuration) * 100)}%`,
                            backgroundColor: color,
                          }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
