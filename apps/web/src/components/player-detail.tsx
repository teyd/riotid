import { useQuery } from '@tanstack/react-query'
import ArrowLeftIcon from 'kubai-icons-react/icons/arrow-left'
import { useState } from 'react'

import {
  cardAccent,
  cardArt,
  cardWideArt,
  fetchPlayer,
  FLAG,
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
      <p className="truncate text-sm text-zinc-100">{title}</p>
      <p className="mt-1 font-mono text-[11px] text-zinc-500">{subtitle}</p>
    </div>
    {current ? <Badge tone="accent">now</Badge> : null}
  </div>
)

const EvidenceDetail = ({ label, value }: { label: string; value: string | number }) => (
  <div>
    <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</dt>
    <dd className="mt-1 break-all font-mono text-[11px] text-zinc-200">{value}</dd>
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
        <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
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
          <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">card</dt>
          <dd className="mt-1 flex items-center gap-2">
            <a
              href={`https://media.valorant-api.com/playercards/${a.cardId}/smallart.png`}
              target="_blank"
              rel="noreferrer noopener"
              className="block h-9 w-7 overflow-hidden rounded-sm bg-white/[0.06]"
            >
              <img
                src={`https://media.valorant-api.com/playercards/${a.cardId}/smallart.png`}
                alt=""
                width={28}
                height={36}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
              />
            </a>
          </dd>
        </div>
      </dl>

      <div className="mt-4 space-y-1.5 font-mono text-[11px]">
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
  const flags = row?.[P.flags] ?? 0
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
    <div className="flex h-full flex-col overflow-y-auto">
      <div
        className="sticky top-0 z-10 border-b border-white/[0.06] bg-ink/95 px-6 py-5 backdrop-blur"
        style={
          wideArt
            ? {
                backgroundImage: `linear-gradient(90deg, rgba(9,9,11,0.985) 0%, rgba(9,9,11,0.95) 60%, rgba(9,9,11,0.9) 100%), url(${wideArt})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined
        }
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            {cardArt(resolvedCardId) ? (
              <span
                className="hidden h-14 w-11 shrink-0 overflow-hidden rounded-sm ring-1 ring-white/15 sm:block"
                style={{ backgroundColor: cardAccent(resolvedCardId) }}
              >
                <img
                  src={cardArt(resolvedCardId) ?? ''}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none'
                  }}
                />
              </span>
            ) : null}
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
                <h1 className="truncate text-3xl font-semibold tracking-tight text-zinc-50">
                  {name || 'Anonymous'}
                </h1>
                {tag ? <span className="font-mono text-sm text-zinc-400">#{tag}</span> : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge>{regionLabel(region)}</Badge>
                {flags & FLAG.anonymized ? <Badge tone="info">linked anonymously</Badge> : null}
                {detail?.player.isBanned ? <Badge tone="warn">banned</Badge> : null}
                {flags & FLAG.nameChange ? <Badge tone="neutral">renamed</Badge> : null}
                {flags & FLAG.regionChange ? <Badge tone="accent">moved</Badge> : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 font-mono text-[10px] uppercase tracking-wide">
            {name && tag ? (
              <a
                href={trackerProfileUrl(name, tag)}
                target="_blank"
                rel="noreferrer noopener"
                className="text-zinc-400 hover:text-zinc-100"
              >
                tracker.gg ↗
              </a>
            ) : null}
            <a
              href={vtlProfileUrl(puuid)}
              target="_blank"
              rel="noreferrer noopener"
              className="text-zinc-400 hover:text-zinc-100"
            >
              vtl.lol ↗
            </a>
            <button type="button" onClick={copy} className="text-zinc-400 hover:text-zinc-100">
              {copied ? 'copied' : 'copy link'}
            </button>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-3 font-mono text-[11px]">
          <div>
            <dt className="text-zinc-600">first seen</dt>
            <dd className="mt-1 text-sm text-zinc-200">
              {formatDate(detail?.player.firstSeenAt ?? row?.[P.firstSeenAt] ?? null)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-600">last seen</dt>
            <dd className="mt-1 text-sm text-zinc-200">
              {formatRelative(detail?.player.lastSeenAt ?? row?.[P.lastSeenAt] ?? null)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-600">observations</dt>
            <dd className="mt-1 text-sm text-zinc-200">{detail?.player.timesSeen ?? '—'}</dd>
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
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {[
                ['name changes', detail.player.nameChanges],
                ['region changes', detail.player.regionChanges],
                ['bans', detail.player.banCount],
                ['unbans', detail.player.unbanCount],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
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
