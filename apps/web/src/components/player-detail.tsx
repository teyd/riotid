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
import { useEffect, useRef, useState } from 'react'

import {
  cardArt,
  cardLargeArt,
  fetchPlayer,
  formatDate,
  formatDateTime,
  formatRelative,
  P,
  playerUrl,
  regionLabel,
  regionShort,
  trackerProfileUrl,
  type IndexRow,
  type PlayerDetail,
  vtlProfileUrl,
} from '../lib/api.ts'
import { copyText } from '../lib/clipboard.ts'
import { CardArt } from './card-art.tsx'
import { Badge, LoadingState, Section } from './ui.tsx'

type Props = {
  readonly puuid: string
  readonly row: IndexRow | null
  readonly cardId: string | null
  readonly focusOnMount: boolean
  readonly focusHeading: boolean
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
        key={`${item.at}-${item.title}-${item.subtitle}`}
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
            className="mt-1 block font-mono text-[12px] text-zinc-400"
          >
            {item.subtitle}
          </TimelineTime>
        </div>
      </TimelineItem>
    ))}
  </Timeline>
)

type HistoryItem = { title: string; subtitle: string; current: boolean; at: number }

const intervalRange = (startedAt: number, endedAt: number | null): string =>
  `${formatDate(startedAt)} → ${endedAt ? formatDate(endedAt) : 'present'}`

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
    meta={<span className="font-mono text-[11px] text-zinc-400">{items.length}</span>}
  >
    {items.length === 0 ? (
      <p className="text-xs text-zinc-400">{empty}</p>
    ) : (
      <HistoryTimeline label={title} items={items} />
    )}
  </Section>
)

const HeaderStat = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col justify-center px-3 py-2.5 sm:px-4">
    <dt className="text-[11px] leading-4 text-zinc-400">{label}</dt>
    <dd className="mt-0.5 whitespace-nowrap text-[14px] leading-5 text-zinc-200">{value}</dd>
  </div>
)

const EvidenceDetail = ({ label, value }: { label: string; value: string | number }) => (
  <div>
    <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">{label}</dt>
    <dd className="mt-1 break-all font-mono text-[12px] text-zinc-200">{value}</dd>
  </div>
)

const Evidence = ({ link }: { link: PlayerDetail['links'][number] }) => {
  const a = link.anonymous
  const matchUrl = link.matchId ? `https://vtl.lol/match/${link.matchId}` : null
  const cardHref = cardLargeArt(a.cardId) ?? cardArt(a.cardId)
  const cardImage = (
    <CardArt
      art={cardLargeArt(a.cardId)}
      name={a.cardId}
      fallback="n/a"
      width={28}
      height={40}
      className="flex h-10 w-7 shrink-0 items-center justify-center rounded-sm border border-white/[0.08] bg-white/[0.03] font-mono text-[9px] text-zinc-400"
    />
  )

  return (
    <div className="border-t border-white/[0.07] py-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-200">
            {link.method === 'match_graph'
              ? 'Exact MMR fingerprint in a shared match'
              : 'Direct puuid from the leaderboard row'}
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-400">
            {link.method === 'match_graph'
              ? 'Leaderboard rank is unique per region. Rank, rating, wins, and tier matched exactly; the match supplies the identity.'
              : 'The anonymized leaderboard row still carried a puuid, so no match graph was needed.'}
          </p>
        </div>
        <span className="font-mono text-[12px] text-zinc-300 tabular-nums">
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
          <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">card</dt>
          <dd className="mt-1">
            {cardHref ? (
              <a
                href={cardHref}
                target="_blank"
                rel="noreferrer noopener"
                className="group flex items-center gap-2"
              >
                {cardImage}
                <span className="font-mono text-[11px] text-zinc-400 group-hover:text-zinc-200">
                  {a.cardId.slice(0, 8)}
                </span>
              </a>
            ) : (
              <span className="flex items-center gap-2">
                {cardImage}
                <span className="font-mono text-[11px] text-zinc-400">{a.cardId.slice(0, 8)}</span>
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-4 space-y-1.5 font-mono text-[12px]">
        {matchUrl ? (
          <p className="break-all">
            <span className="text-zinc-400">match </span>
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
          <p className="text-zinc-400">no match lookup required</p>
        )}
        <p className="text-zinc-400">linked {formatDateTime(link.createdAt)}</p>
      </div>
    </div>
  )
}

const CopyLink = ({ puuid }: { puuid: string }) => {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    window.clearTimeout(timer.current)
    const copied = await copyText(playerUrl(window.location.origin, puuid))
    setStatus(copied ? 'copied' : 'error')
    timer.current = window.setTimeout(() => setStatus('idle'), copied ? 1600 : 4000)
  }

  return (
    <>
      <ToolbarButton
        onClick={copy}
        aria-label="Copy link to this player"
        className="inline-flex min-h-6 items-center rounded-sm px-1 text-zinc-300 hover:text-white"
      >
        {status === 'copied' ? 'copied' : status === 'error' ? 'copy failed' : 'copy link'}
      </ToolbarButton>
      <span role="status" className="sr-only">
        {status === 'copied'
          ? 'Link copied to clipboard.'
          : status === 'error'
            ? 'Could not copy the link. Copy the address from the browser instead.'
            : ''}
      </span>
    </>
  )
}

export const PlayerDetailPanel = ({
  puuid,
  row,
  cardId,
  focusOnMount,
  focusHeading,
  onBack,
}: Props) => {
  const query = useQuery({
    queryKey: ['player', puuid],
    queryFn: () => fetchPlayer(puuid),
    staleTime: 60_000,
  })
  const backRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const detail = query.data
  const name = detail?.player.name ?? row?.[P.name] ?? ''
  const tag = detail?.player.tag ?? row?.[P.tag] ?? ''
  const region = detail?.player.region ?? row?.[P.region] ?? null
  const resolvedCardId = detail?.player.cardId ?? cardId
  const cardHref = cardLargeArt(resolvedCardId) ?? cardArt(resolvedCardId)

  const cardImage = (
    <CardArt
      art={cardArt(resolvedCardId)}
      name={name}
      width={56}
      height={56}
      loading="eager"
      className="flex size-14 items-center justify-center font-mono text-sm text-zinc-400"
    />
  )

  useEffect(() => {
    if (!focusOnMount) return
    if (window.matchMedia('(max-width: 1023px)').matches) {
      backRef.current?.focus()
      return
    }
    if (focusHeading) headingRef.current?.focus()
  }, [focusHeading, focusOnMount])

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <div className="sticky top-0 z-10 border-b border-white/[0.08] bg-ink px-6 py-5">
        <button
          ref={backRef}
          type="button"
          onClick={onBack}
          aria-label="Back to player list"
          className="-ml-2 mb-4 flex min-h-11 items-center gap-1 rounded-sm px-2 font-mono text-[11px] uppercase tracking-wide text-zinc-400 hover:text-zinc-100 lg:hidden"
        >
          <span aria-hidden>←</span> players
        </button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            {cardHref ? (
              <a
                href={cardHref}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Open player card in a new tab"
                className="relative hidden size-14 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-white/20 bg-white/[0.03] font-mono text-sm text-zinc-400 sm:flex"
              >
                {cardImage}
              </a>
            ) : (
              <span className="relative hidden size-14 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-white/20 bg-white/[0.03] sm:flex">
                {cardImage}
              </span>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h2
                  ref={headingRef}
                  tabIndex={-1}
                  className="truncate text-3xl font-semibold tracking-tight text-zinc-50 focus:outline-none"
                >
                  {name || 'Anonymous'}
                </h2>
                {tag ? <span className="font-mono text-sm text-zinc-300">#{tag}</span> : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge>{regionLabel(region)}</Badge>
                {detail?.player.isBanned ? <Badge tone="warn">banned</Badge> : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
            <Toolbar
              aria-label="Player links"
              className="flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-wide sm:justify-end"
            >
              {name && tag ? (
                <ToolbarLink
                  href={trackerProfileUrl(name, tag)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-h-6 items-center rounded-sm px-1 text-zinc-300 hover:text-white"
                >
                  tracker.gg <span aria-hidden>↗</span>
                </ToolbarLink>
              ) : null}
              <ToolbarLink
                href={vtlProfileUrl(puuid)}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-6 items-center rounded-sm px-1 text-zinc-300 hover:text-white"
              >
                vtl.lol <span aria-hidden>↗</span>
              </ToolbarLink>
              <CopyLink puuid={puuid} />
            </Toolbar>
          </div>
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

      {query.isPending ? <LoadingState label="Loading history…" /> : null}
      {query.isError ? (
        <div role="alert" className="flex flex-col items-start gap-3 px-6 py-6">
          <p className="text-base text-zinc-200">Could not load this player.</p>
          <p className="font-mono text-xs text-zinc-400">{query.error.message}</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="rounded border border-white/40 px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-zinc-100 hover:bg-white/10"
          >
            Retry
          </button>
        </div>
      ) : null}

      {detail ? (
        <>
          {detail.player.isBanned ? (
            <div className="border-t border-white/[0.08] bg-white/[0.03] px-5 py-3 text-xs text-zinc-300">
              Ban state comes from the competitive leaderboard flag. History is retained.
            </div>
          ) : null}

          <HistorySection
            title="Name history"
            empty="No authoritative name yet."
            items={[...detail.names].reverse().map((interval) => ({
              title: `${interval.name}#${interval.tag}`,
              subtitle: intervalRange(interval.startedAt, interval.endedAt),
              current: interval.endedAt === null,
              at: interval.startedAt,
            }))}
          />

          <HistorySection
            title="Region history"
            empty="No region interval observed."
            items={[...detail.regions].reverse().map((interval) => ({
              title: regionLabel(interval.region),
              subtitle: `${intervalRange(interval.startedAt, interval.endedAt)} · ${regionShort(interval.region)} affinity`,
              current: interval.endedAt === null,
              at: interval.startedAt,
            }))}
          />

          <HistorySection
            title="Ban history"
            empty="No ban interval observed."
            items={[...detail.bans].reverse().map((interval) => ({
              title: interval.endedAt ? 'Banned, then unbanned' : 'Banned',
              subtitle: intervalRange(interval.startedAt, interval.endedAt),
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
                  <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">
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
                <span className="font-mono text-[11px] text-zinc-400">{detail.links.length}</span>
              }
            >
              <div className="space-y-2">
                {detail.links.map((link, index) => (
                  <Evidence key={`${link.matchId}-${index}`} link={link} />
                ))}
              </div>
            </Section>
          ) : null}

          <div className="border-t border-white/[0.06] px-5 py-4 font-mono text-[11px] text-zinc-400">
            puuid {puuid} · last change {formatDateTime(detail.player.lastNameChangeAt)}
          </div>
        </>
      ) : null}
    </div>
  )
}
