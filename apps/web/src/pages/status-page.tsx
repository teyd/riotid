import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

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
  <div className="grid grid-cols-[150px_1fr] gap-4 border-b border-white/[0.05] py-3 last:border-0">
    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</span>
    <span className="font-mono text-xs text-zinc-200">
      {value}
      {hint ? <span className="mt-1 block break-all text-zinc-500">{hint}</span> : null}
    </span>
  </div>
)

const Group = ({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) => (
  <section className="grid gap-5 border-t border-white/[0.08] py-7 lg:grid-cols-[230px_1fr] lg:gap-10">
    <div>
      <h2 className="text-sm font-medium text-zinc-200">{title}</h2>
      <p className="mt-2 text-xs leading-5 text-zinc-500">{description}</p>
    </div>
    <div>{children}</div>
  </section>
)

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

  return (
    <div className="mx-auto h-full w-full max-w-4xl overflow-y-auto px-5 py-9 sm:px-6">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Readiness</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">System status</h1>
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-zinc-400">
            <span className={`size-2 rounded-full ${data.ok ? 'bg-accent' : 'bg-amber-400'}`} />
            {data.ok ? 'operational' : 'degraded'}
          </span>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400">
          The public API is read-only and never calls Riot. Scans refresh the index; the identity
          pass and backups run on their own schedules.
        </p>
      </header>

      <Group
        title="Runtime"
        description="The API process, the SQLite file, and the in-memory public index."
      >
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
      </Group>

      <Group
        title="Pipeline"
        description="Scans, identity resolution, and the local backup rotation."
      >
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
      </Group>

      <Group
        title="Riot auth"
        description="The long-lived cookie jar lives on the data volume; tokens refresh every 45 minutes."
      >
        <Row
          label="cookie jar"
          value={data.auth.updatedAt ? formatRelative(data.auth.updatedAt) : 'missing'}
          hint={data.auth.cookieFile}
        />
        <Row
          label="refresh policy"
          value="45 minutes"
          hint="QR login is only needed when the jar expires"
        />
      </Group>

      <Group
        title="Coverage"
        description="Anonymized leaderboard rows are linked only with an exact match-graph fingerprint."
      >
        <Row
          label="anonymous rows"
          value={`${data.anonymous.linked.toLocaleString()} linked · ${data.anonymous.unresolved.toLocaleString()} unresolved`}
          hint={`${data.anonymous.total.toLocaleString()} observed`}
        />
        <Row
          label="public index"
          value={`${data.index.players.toLocaleString()} players`}
          hint="banned and unresolved rows excluded"
        />
      </Group>

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
