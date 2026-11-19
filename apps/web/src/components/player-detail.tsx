import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@ui-sdk/react/popover'
import { useQuery } from '@tanstack/react-query'
import ArrowLeftIcon from 'kubai-icons-react/icons/arrow-left'
import ExternalLinkIcon from 'kubai-icons-react/icons/external-link'
import { useState } from 'react'

import {
  fetchPlayer,
  FLAG,
  formatDate,
  formatDateTime,
  formatRelative,
  P,
  regionLabel,
  regionShort,
  type IndexRow,
  type PlayerDetail,
} from '../lib/api.ts'
import { Badge, EmptyState, LoadingState, Section } from './ui.tsx'

type Props = {
  readonly puuid: string
  readonly row: IndexRow | null
  readonly onBack: () => void
}

const TimelineRow = ({
  title,
  subtitle,
  current,
}: {
  title: string
  subtitle: string
  current: boolean
}) => (
  <div className="flex items-baseline justify-between gap-4 py-2">
    <div className="min-w-0">
      <p className="truncate text-[13px] text-zinc-200">{title}</p>
      <p className="mt-0.5 font-mono text-[10px] text-zinc-600">{subtitle}</p>
    </div>
    {current ? <Badge tone="accent">now</Badge> : null}
  </div>
)

const Evidence = ({ link }: { link: PlayerDetail['links'][number] }) => (
  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Badge tone="info">linked via match</Badge>
        <span className="font-mono text-[10px] text-zinc-500">
          {(link.confidence / 100).toFixed(2)}% confidence
        </span>
      </div>
      {link.matchId ? (
        <a
          href={`https://vtl.lol/match/${link.matchId}`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 font-mono text-[10px] text-accent hover:underline"
        >
          {link.matchId.slice(0, 8)}… <ExternalLinkIcon className="size-3" />
        </a>
      ) : (
        <span className="font-mono text-[10px] text-zinc-500">direct puuid</span>
      )}
    </div>

    <div className="mt-2 flex items-center justify-between gap-2">
      <p className="font-mono text-[10px] text-zinc-500">
        {link.method === 'direct_puuid' ? 'leaderboard carried the puuid' : 'exact MMR fingerprint'}
      </p>
      <Popover>
        <PopoverTrigger className="rounded border border-white/10 px-2 py-0.5 font-mono text-[10px] text-zinc-400 hover:border-white/25 hover:text-zinc-200">
          why?
        </PopoverTrigger>
        <PopoverContent className="z-50 w-80 rounded-xl border border-white/10 bg-panel p-4 text-sm shadow-2xl">
          <PopoverTitle className="font-medium text-zinc-100">Link evidence</PopoverTitle>
          <PopoverDescription className="mt-1 text-xs leading-5 text-zinc-500">
            Leaderboard rank is unique per region. Rank, rating, wins, and tier all matched exactly.
          </PopoverDescription>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[10px]">
            {[
              ['rank', link.anonymous.leaderboardRank],
              ['rating', link.anonymous.rankedRating],
              ['wins', link.anonymous.numberOfWins],
              ['tier', link.anonymous.competitiveTier],
              ['card', link.anonymous.cardId.slice(0, 8)],
              ['title', link.anonymous.titleId.slice(0, 8)],
            ].map(([label, value]) => (
              <div key={String(label)} className="contents">
                <dt className="text-zinc-600">{label}</dt>
                <dd className="text-zinc-300">{value}</dd>
              </div>
            ))}
          </dl>
        </PopoverContent>
      </Popover>
    </div>
  </div>
)

export const PlayerDetailPanel = ({ puuid, row, onBack }: Props) => {
  const query = useQuery({
    queryKey: ['player', puuid],
    queryFn: () => fetchPlayer(puuid),
    staleTime: 60_000,
  })
  const [copied, setCopied] = useState(false)

  const detail = query.data
  const flags = row?.[P.flags] ?? 0
  const name = detail?.player.name ?? row?.[P.name] ?? ''
  const tag = detail?.player.tag ?? row?.[P.tag] ?? ''
  const region = detail?.player.region ?? row?.[P.region] ?? null

  const copy = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/players/${puuid}`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-ink/95 px-5 py-4 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              className="-ml-1 mt-0.5 rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-200 lg:hidden"
              aria-label="Back to players"
            >
              <ArrowLeftIcon className="size-4" />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-50">
                  {name || 'Anonymous'}
                </h1>
                {tag ? <span className="font-mono text-xs text-zinc-500">#{tag}</span> : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge>{regionLabel(region)}</Badge>
                {flags & FLAG.anonymized ? <Badge tone="info">linked anonymously</Badge> : null}
                {detail?.player.isBanned || row === null ? (
                  detail?.player.isBanned ? (
                    <Badge tone="warn">banned</Badge>
                  ) : null
                ) : null}
                {flags & FLAG.nameChange ? <Badge tone="neutral">renamed</Badge> : null}
                {flags & FLAG.regionChange ? <Badge tone="accent">moved</Badge> : null}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={copy}
            className="shrink-0 rounded border border-white/10 px-2 py-1 font-mono text-[10px] text-zinc-400 hover:border-white/25 hover:text-zinc-200"
          >
            {copied ? 'copied' : 'copy link'}
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3 font-mono text-[10px]">
          <div>
            <dt className="text-zinc-600">first seen</dt>
            <dd className="mt-0.5 text-zinc-300">
              {formatDate(detail?.player.firstSeenAt ?? row?.[P.firstSeenAt] ?? null)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-600">last seen</dt>
            <dd className="mt-0.5 text-zinc-300">
              {formatRelative(detail?.player.lastSeenAt ?? row?.[P.lastSeenAt] ?? null)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-600">observations</dt>
            <dd className="mt-0.5 text-zinc-300">{detail?.player.timesSeen ?? '—'}</dd>
          </div>
        </dl>
      </div>

      {query.isPending ? <LoadingState label="Loading history" /> : null}
      {query.isError ? (
        <EmptyState title="Could not load this player." hint={query.error.message} />
      ) : null}

      {detail ? (
        <>
          {detail.player.isBanned ? (
            <div className="border-t border-amber-400/20 bg-amber-400/[0.06] px-5 py-3 text-xs text-amber-200">
              Ban state comes from the competitive leaderboard flag. History is retained.
            </div>
          ) : null}

          <Section
            title="Name history"
            meta={
              <span className="font-mono text-[10px] text-zinc-600">{detail.names.length}</span>
            }
          >
            {detail.names.length === 0 ? (
              <p className="text-xs text-zinc-600">No authoritative name yet.</p>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {[...detail.names].reverse().map((interval, index) => (
                  <TimelineRow
                    key={`${interval.startedAt}-${index}`}
                    title={`${interval.name}#${interval.tag}`}
                    subtitle={`${formatDate(interval.startedAt)} → ${interval.endedAt ? formatDate(interval.endedAt) : 'present'}`}
                    current={interval.endedAt === null}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Region history"
            meta={
              <span className="font-mono text-[10px] text-zinc-600">{detail.regions.length}</span>
            }
          >
            <div className="divide-y divide-white/[0.04]">
              {[...detail.regions].reverse().map((interval, index) => (
                <TimelineRow
                  key={`${interval.startedAt}-${index}`}
                  title={regionLabel(interval.region)}
                  subtitle={`${formatDate(interval.startedAt)} → ${interval.endedAt ? formatDate(interval.endedAt) : 'present'} · ${regionShort(interval.region)} affinity`}
                  current={interval.endedAt === null}
                />
              ))}
            </div>
          </Section>

          <Section
            title="Ban history"
            meta={<span className="font-mono text-[10px] text-zinc-600">{detail.bans.length}</span>}
          >
            {detail.bans.length === 0 ? (
              <p className="text-xs text-zinc-600">No ban interval observed.</p>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {[...detail.bans].reverse().map((interval, index) => (
                  <TimelineRow
                    key={`${interval.startedAt}-${index}`}
                    title={interval.endedAt ? 'Banned, then unbanned' : 'Banned'}
                    subtitle={`${formatDate(interval.startedAt)} → ${interval.endedAt ? formatDate(interval.endedAt) : 'present'}`}
                    current={interval.endedAt === null}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title="Counters">
            <dl className="grid grid-cols-2 gap-2 font-mono text-[10px] sm:grid-cols-4">
              {[
                ['name changes', detail.player.nameChanges],
                ['region changes', detail.player.regionChanges],
                ['bans', detail.player.banCount],
                ['unbans', detail.player.unbanCount],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded border border-white/5 bg-white/[0.02] px-2 py-1.5"
                >
                  <dt className="text-zinc-600">{label}</dt>
                  <dd className="mt-0.5 text-sm text-zinc-200">{value}</dd>
                </div>
              ))}
            </dl>
          </Section>

          {detail.links.length > 0 ? (
            <Section
              title="Identity evidence"
              meta={
                <span className="font-mono text-[10px] text-zinc-600">{detail.links.length}</span>
              }
            >
              <div className="space-y-2">
                {detail.links.map((link, index) => (
                  <Evidence key={`${link.matchId}-${index}`} link={link} />
                ))}
              </div>
            </Section>
          ) : null}

          <div className="border-t border-white/[0.06] px-5 py-4 font-mono text-[10px] text-zinc-600">
            puuid {puuid} · last change {formatDateTime(detail.player.lastNameChangeAt)}
          </div>
        </>
      ) : null}
    </div>
  )
}
