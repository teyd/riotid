import { HoverCard, HoverCardContent, HoverCardTrigger } from '@ui-sdk/react/hover-card'
import { Toolbar, ToolbarButton, ToolbarLink } from '@ui-sdk/react/toolbar'
import {
  Timeline,
  TimelineConnector,
  TimelineItem,
  TimelineMarker,
  TimelineTime,
  TimelineTitle,
} from '@ui-sdk/react/timeline'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import {
  cardArt,
  cardLargeArt,
  cardWideArt,
  fetchPlayer,
  formatDate,
  formatDateTime,
  formatRelative,
  P,
  regionLabel,
  regionShort,
  trackerProfileUrl,
  type IndexRow,
  type PlayerDetail,
  vtlProfileUrl,
} from '../lib/api.ts'
import { Badge, EmptyState, LoadingState, Section } from './ui.tsx'

type Props = {
  readonly puuid: string
  readonly row: IndexRow | null
  readonly cardId: string | null
  readonly onBack: () => void
}

const HistoryTimeline = ({
  label,
  items,
}: {
  label: string
  items: ReadonlyArray<{ title: string; subtitle: string; current: boolean; at: number }>
}) => (
  <Timeline aria-label={label} className="space-y-0">
    {items.map((item, index) => (
      <TimelineItem
        key={`${item.at}-${index}`}
        status={item.current ? 'current' : 'complete'}
        className="relative grid grid-cols-[10px_1fr] gap-x-4 pb-5 last:pb-0"
      >
        <div className="relative flex justify-center">
          <TimelineMarker className="relative z-[1] mt-1.5 size-2 rounded-full bg-zinc-600 data-[current]:bg-accent" />
        </div>
        {index < items.length - 1 ? (
          <TimelineConnector className="absolute top-3.5 -bottom-[5px] left-1 w-px bg-white/[0.09]" />
        ) : null}
        <div className="min-w-0">
          <TimelineTitle className="truncate text-sm text-zinc-100">{item.title}</TimelineTitle>
          <TimelineTime
            dateTime={new Date(item.at).toISOString()}
            className="mt-1 block font-mono text-[12px] text-zinc-500"
          >
            {item.subtitle}
          </TimelineTime>
        </div>
      </TimelineItem>
    ))}
  </Timeline>
)

type HistoryItem = { title: string; subtitle: string; current: boolean; at: number }

const HistorySection = ({
  title,
  empty,
  items,
}: {
  title: string
  empty: string
  items: ReadonlyArray<HistoryItem>
}) => (
  <Section
    title={title}
    meta={<span className="font-mono text-[11px] text-zinc-500">{items.length}</span>}
  >
    {items.length === 0 ? (
      <p className="text-xs text-zinc-500">{empty}</p>
    ) : (
      <HistoryTimeline label={title} items={items} />
    )}
  </Section>
)

const HeaderStat = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col justify-center px-3 py-2.5 sm:px-4">
    <dt className="text-[11px] leading-4 text-zinc-500">{label}</dt>
    <dd className="mt-0.5 whitespace-nowrap text-[14px] leading-5 text-zinc-200">{value}</dd>
  </div>
)

const EvidenceDetail = ({ label, value }: { label: string; value: string | number }) => (
  <div>
    <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">{label}</dt>
    <dd className="mt-1 break-all font-mono text-[12px] text-zinc-200">{value}</dd>
  </div>
)

const Evidence = ({ link }: { link: PlayerDetail['links'][number] }) => {
  const a = link.anonymous
  const matchUrl = link.matchId ? `https://vtl.lol/match/${link.matchId}` : null

  return (
    <div className="border-t border-white/[0.07] py-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-200">
            {link.method === 'match_graph'
              ? 'Exact MMR fingerprint in a shared match'
              : 'Direct puuid from the leaderboard row'}
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
            {link.method === 'match_graph'
              ? 'Leaderboard rank is unique per region. Rank, rating, wins, and tier matched exactly; the match supplies the identity.'
              : 'The anonymized leaderboard row still carried a puuid, so no match graph was needed.'}
          </p>
        </div>
        <span className="font-mono text-[12px] text-zinc-400 tabular-nums">
          {(link.confidence / 100).toFixed(2)}% confidence
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <EvidenceDetail label="rank" value={a.leaderboardRank} />
        <EvidenceDetail label="rating" value={a.rankedRating} />
        <EvidenceDetail label="wins" value={a.numberOfWins} />
        <EvidenceDetail label="tier" value={a.competitiveTier} />
        <EvidenceDetail label="region" value={regionLabel(a.region)} />
        <EvidenceDetail label="season" value={a.seasonName ?? 'unknown act'} />
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">card</dt>
          <dd className="mt-1">
            <a
              href={cardLargeArt(a.cardId) ?? cardArt(a.cardId) ?? '#'}
              target="_blank"
              rel="noreferrer noopener"
              className="group flex items-center gap-2"
            >
              <span className="relative flex h-10 w-7 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-white/[0.08] bg-white/[0.03] font-mono text-[9px] text-zinc-500">
                <span aria-hidden>n/a</span>
                {cardLargeArt(a.cardId) ? (
                  <img
                    src={cardLargeArt(a.cardId) ?? ''}
                    alt=""
                    width={28}
                    height={40}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                ) : null}
              </span>
              <span className="font-mono text-[11px] text-zinc-500 group-hover:text-zinc-300">
                {a.cardId.slice(0, 8)}
              </span>
            </a>
          </dd>
        </div>
      </dl>

      <div className="mt-4 space-y-1.5 font-mono text-[12px]">
        {matchUrl ? (
          <p className="break-all">
            <span className="text-zinc-500">match </span>
            <a
              href={matchUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent hover:underline"
            >
              {matchUrl}
            </a>
          </p>
        ) : (
          <p className="text-zinc-500">no match lookup required</p>
        )}
        <p className="text-zinc-500">linked {formatDateTime(link.createdAt)}</p>
      </div>
    </div>
  )
}

export const PlayerDetailPanel = ({ puuid, row, cardId, onBack }: Props) => {
  const query = useQuery({
    queryKey: ['player', puuid],
    queryFn: () => fetchPlayer(puuid),
    staleTime: 60_000,
  })
  const [copied, setCopied] = useState(false)

  const detail = query.data
  const name = detail?.player.name ?? row?.[P.name] ?? ''
  const tag = detail?.player.tag ?? row?.[P.tag] ?? ''
  const region = detail?.player.region ?? row?.[P.region] ?? null
  const resolvedCardId = detail?.player.cardId ?? cardId
  const wideArt = cardWideArt(resolvedCardId)

  const copy = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/puuid/${puuid}`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <div className="relative h-24 w-full shrink-0 overflow-hidden border-b border-white/[0.08] bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:28px_28px]">
        {wideArt ? (
          <img
            src={wideArt}
            alt=""
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
        ) : null}
      </div>

      <div className="sticky top-0 z-10 border-b border-white/[0.08] bg-ink px-6 py-5">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 flex items-center gap-1 font-mono text-[11px] uppercase tracking-wide text-zinc-500 hover:text-zinc-200 lg:hidden"
        >
          ← players
        </button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <HoverCard>
              <HoverCardTrigger
                href={cardWideArt(resolvedCardId) ?? cardArt(resolvedCardId) ?? '#'}
                className="relative hidden size-14 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-white/10 bg-white/[0.03] font-mono text-sm text-zinc-500 sm:flex"
              >
                <span aria-hidden>{(name || '?').slice(0, 1).toUpperCase()}</span>
                {cardArt(resolvedCardId) ? (
                  <img
                    src={cardArt(resolvedCardId) ?? ''}
                    alt={`${name || 'Player'} card`}
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                ) : null}
              </HoverCardTrigger>
              <HoverCardContent className="z-50 w-72 overflow-hidden rounded-lg border border-white/10 bg-panel shadow-2xl">
                <img
                  src={cardWideArt(resolvedCardId) ?? ''}
                  alt=""
                  className="h-36 w-full object-cover"
                />
                <p className="px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-zinc-400">
                  {name || 'Anonymous'}
                  {tag ? `#${tag}` : ''}
                </p>
              </HoverCardContent>
            </HoverCard>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h1 className="truncate text-3xl font-semibold tracking-tight text-zinc-50">
                  {name || 'Anonymous'}
                </h1>
                {tag ? <span className="font-mono text-sm text-zinc-400">#{tag}</span> : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge>{regionLabel(region)}</Badge>
                {detail?.player.isBanned ? <Badge tone="warn">banned</Badge> : null}
              </div>
            </div>
          </div>

          <Toolbar
            aria-label="Player links"
            className="flex shrink-0 flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-wide sm:justify-end"
          >
            {name && tag ? (
              <ToolbarLink
                href={trackerProfileUrl(name, tag)}
                target="_blank"
                rel="noreferrer noopener"
                className="text-zinc-400 hover:text-zinc-100"
              >
                tracker.gg ↗
              </ToolbarLink>
            ) : null}
            <ToolbarLink
              href={vtlProfileUrl(puuid)}
              target="_blank"
              rel="noreferrer noopener"
              className="text-zinc-400 hover:text-zinc-100"
            >
              vtl.lol ↗
            </ToolbarLink>
            <ToolbarButton onClick={copy} className="text-zinc-400 hover:text-zinc-100">
              {copied ? 'copied' : 'copy link'}
            </ToolbarButton>
          </Toolbar>
        </div>

        <dl className="mt-5 grid grid-cols-3 divide-x divide-white/[0.06] rounded-md border border-white/[0.07] bg-white/[0.02] font-mono text-[12px]">
          <HeaderStat
            label="first seen"
            value={formatDate(detail?.player.firstSeenAt ?? row?.[P.firstSeenAt] ?? null)}
          />
          <HeaderStat
            label="last seen"
            value={formatRelative(detail?.player.lastSeenAt ?? row?.[P.lastSeenAt] ?? null)}
          />
          <HeaderStat label="observations" value={String(detail?.player.timesSeen ?? '—')} />
        </dl>
      </div>

      {query.isPending ? <LoadingState label="Loading history" /> : null}
      {query.isError ? (
        <EmptyState title="Could not load this player." hint={query.error.message} />
      ) : null}

      {detail ? (
        <>
          {detail.player.isBanned ? (
            <div className="border-t border-white/[0.08] bg-white/[0.03] px-5 py-3 text-xs text-zinc-400">
              Ban state comes from the competitive leaderboard flag. History is retained.
            </div>
          ) : null}

          <HistorySection
            title="Name history"
            empty="No authoritative name yet."
            items={[...detail.names].reverse().map((interval) => ({
              title: `${interval.name}#${interval.tag}`,
              subtitle: `${formatDate(interval.startedAt)} → ${interval.endedAt ? formatDate(interval.endedAt) : 'present'}`,
              current: interval.endedAt === null,
              at: interval.startedAt,
            }))}
          />

          <HistorySection
            title="Region history"
            empty="No region interval observed."
            items={[...detail.regions].reverse().map((interval) => ({
              title: regionLabel(interval.region),
              subtitle: `${formatDate(interval.startedAt)} → ${interval.endedAt ? formatDate(interval.endedAt) : 'present'} · ${regionShort(interval.region)} affinity`,
              current: interval.endedAt === null,
              at: interval.startedAt,
            }))}
          />

          <HistorySection
            title="Ban history"
            empty="No ban interval observed."
            items={[...detail.bans].reverse().map((interval) => ({
              title: interval.endedAt ? 'Banned, then unbanned' : 'Banned',
              subtitle: `${formatDate(interval.startedAt)} → ${interval.endedAt ? formatDate(interval.endedAt) : 'present'}`,
              current: interval.endedAt === null,
              at: interval.startedAt,
            }))}
          />

          <Section title="Counters">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {[
                ['name changes', detail.player.nameChanges],
                ['region changes', detail.player.regionChanges],
                ['bans', detail.player.banCount],
                ['unbans', detail.player.unbanCount],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                    {label}
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold text-zinc-100 tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>

          {detail.links.length > 0 ? (
            <Section
              title="Identity evidence"
              meta={
                <span className="font-mono text-[11px] text-zinc-500">{detail.links.length}</span>
              }
            >
              <div className="space-y-2">
                {detail.links.map((link, index) => (
                  <Evidence key={`${link.matchId}-${index}`} link={link} />
                ))}
              </div>
            </Section>
          ) : null}

          <div className="border-t border-white/[0.06] px-5 py-4 font-mono text-[11px] text-zinc-500">
            puuid {puuid} · last change {formatDateTime(detail.player.lastNameChangeAt)}
          </div>
        </>
      ) : null}
    </div>
  )
}
