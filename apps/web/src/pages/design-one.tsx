import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import ArrowLeftIcon from 'kubai-icons-react/icons/arrow-left'
import SearchIcon from 'kubai-icons-react/icons/search'
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import {
  cardAccent,
  cardArt,
  fetchIndex,
  fetchPlayer,
  FLAG,
  formatDate,
  formatDateTime,
  formatRelative,
  P,
  regionLabel,
  regionShort,
  trackerProfileUrl,
  vtlProfileUrl,
  type IndexRow,
  type PlayerDetail,
  type Region,
} from '../lib/api.ts'

const ROW_HEIGHT = 64
const numberFormat = new Intl.NumberFormat('en-US')

const regions: ReadonlyArray<{ value: 'all' | Region; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'na', label: 'NA' },
  { value: 'eu', label: 'EU' },
  { value: 'ap', label: 'AP' },
  { value: 'kr', label: 'KR' },
]

const methodCopy: Record<
  PlayerDetail['links'][number]['method'],
  { title: string; detail: string }
> = {
  direct_puuid: {
    title: 'Direct puuid',
    detail:
      'The anonymized leaderboard row still carried the stable puuid, so no match graph was needed.',
  },
  mmr_fingerprint: {
    title: 'MMR fingerprint',
    detail: 'Leaderboard rank, rating, wins and tier matched exactly against a single public row.',
  },
  match_graph: {
    title: 'Shared match graph',
    detail:
      'The leaderboard fingerprint resolved through a shared match; every ranked field agrees.',
  },
}

const formatCount = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : numberFormat.format(value)

const spanDays = (startedAt: number, endedAt: number | null): string => {
  const days = Math.max(1, Math.round(((endedAt ?? Date.now()) - startedAt) / 86_400_000))
  return `${numberFormat.format(days)} d`
}

const cardIdFor = (row: IndexRow, cards: ReadonlyArray<string>): string | null => {
  const cardIndex = row[P.cardId]
  return cardIndex === null ? null : (cards[cardIndex] ?? null)
}

const Key = ({ children }: { children: string }) => (
  <kbd className="inline-flex h-5 min-w-5 items-center justify-center border border-[#c9c6bc] px-1 font-mono text-[9px] leading-none text-[#171714]">
    {children}
  </kbd>
)

type IntervalEntry = {
  readonly key: string
  readonly title: string
  readonly meta: string | null
  readonly startedAt: number
  readonly endedAt: number | null
}

const IntervalList = ({
  entries,
  empty,
}: {
  readonly entries: ReadonlyArray<IntervalEntry>
  readonly empty: string
}) => {
  if (entries.length === 0) {
    return (
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#66645c]">{empty}</p>
    )
  }

  return (
    <ol className="divide-y divide-[#e4e1d7]">
      {entries.map((entry) => {
        const current = entry.endedAt === null

        return (
          <li
            key={entry.key}
            className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-3 py-3 sm:grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] sm:gap-x-6"
          >
            <div className="font-mono text-[9px] leading-4 tabular-nums text-[#66645c]">
              <span className="block text-[#171714]">{formatDate(entry.startedAt)}</span>
              <span className={current ? 'text-[#c4291c]' : undefined}>
                {current ? 'present' : formatDate(entry.endedAt)}
              </span>
            </div>

            <div className="min-w-0">
              <p className="break-words text-[14px] leading-5 font-medium tracking-[-0.01em]">
                {entry.title}
              </p>
              {entry.meta ? (
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#66645c]">
                  {entry.meta}
                </p>
              ) : null}
            </div>

            <div
              className={`hidden text-right font-mono text-[9px] uppercase tracking-[0.12em] tabular-nums sm:block ${
                current ? 'text-[#c4291c]' : 'text-[#66645c]'
              }`}
            >
              {current ? 'Current' : spanDays(entry.startedAt, entry.endedAt)}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

const DetailSection = ({
  number,
  title,
  meta,
  children,
}: {
  readonly number: string
  readonly title: string
  readonly meta: string
  readonly children: ReactNode
}) => (
  <section className="px-5 pb-7 pt-7 sm:px-8 lg:px-10">
    <div className="flex items-baseline justify-between gap-4 border-b border-[#171714] pb-2">
      <h3 className="font-mono text-[9px] uppercase tracking-[0.18em]">
        <span className="mr-2 text-[#c4291c]">{number}</span>
        {title}
      </h3>
      <span className="font-mono text-[9px] uppercase tracking-[0.12em] tabular-nums text-[#66645c]">
        {meta}
      </span>
    </div>
    <div className="mt-3">{children}</div>
  </section>
)

const PlayerRow = ({
  row,
  cards,
  position,
  active,
  top,
  onChoose,
  onPrefetch,
}: {
  readonly row: IndexRow
  readonly cards: ReadonlyArray<string>
  readonly position: number
  readonly active: boolean
  readonly top: number
  readonly onChoose: (puuid: string) => void
  readonly onPrefetch: (puuid: string) => void
}) => {
  const puuid = row[P.puuid]
  const cardId = cardIdFor(row, cards)
  const art = cardArt(cardId)
  const name = row[P.name]
  const tag = row[P.tag]
  const region = row[P.region]
  const lastSeen = row[P.lastSeenAt]
  const nameChanges = row[P.nameChanges]
  const regionChanges = row[P.regionChanges]

  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      title={`${name || 'Anonymous'}${tag ? `#${tag}` : ''}`}
      onClick={() => onChoose(puuid)}
      onMouseEnter={() => onPrefetch(puuid)}
      onFocus={() => onPrefetch(puuid)}
      className={`absolute top-0 left-0 grid h-16 w-full grid-cols-[1.75rem_2rem_minmax(0,1fr)_7rem] items-center gap-2 overflow-hidden border-b border-[#e4e1d7] px-4 text-left transition-colors duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-1px] focus-visible:outline-[#c4291c] sm:gap-3 sm:px-6 ${
        active ? 'bg-[#171714] text-[#f2f1ec]' : 'text-[#171714] hover:bg-[#e9e6dc]'
      }`}
      style={{ transform: `translateY(${top}px)` }}
    >
      {active ? (
        <span className="absolute inset-y-0 left-0 w-[2px] bg-[#c4291c]" aria-hidden />
      ) : null}

      <span
        className={`text-right font-mono text-[9px] tabular-nums ${
          active ? 'text-[#8f8c83]' : 'text-[#8a877e]'
        }`}
      >
        {String(position + 1).padStart(3, '0')}
      </span>

      <span
        className={`relative block h-10 w-8 shrink-0 overflow-hidden border ${
          active ? 'border-[#6f6c63]' : 'border-[#d6d3c9]'
        }`}
        style={{ backgroundColor: cardAccent(cardId) }}
      >
        {art ? (
          <img
            src={art}
            alt=""
            width={32}
            height={40}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className="h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
        ) : null}
      </span>

      <span className="min-w-0">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-[14px] font-medium tracking-[-0.01em]">
            {name || 'Anonymous'}
          </span>
          {tag ? (
            <span
              className={`shrink-0 font-mono text-[9px] ${
                active ? 'text-[#aaa79e]' : 'text-[#66645c]'
              }`}
            >
              #{tag}
            </span>
          ) : null}
        </span>
        <span
          className={`mt-1 block truncate font-mono text-[9px] uppercase tracking-[0.12em] ${
            active ? 'text-[#aaa79e]' : 'text-[#66645c]'
          }`}
        >
          {regionLabel(region)}
        </span>
      </span>

      <span className="text-right">
        <span
          className={`block whitespace-nowrap font-mono text-[9px] tabular-nums ${
            active ? 'text-[#dedbd0]' : 'text-[#171714]'
          }`}
        >
          {formatRelative(lastSeen)}
        </span>
        <span
          className={`mt-1 block whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.06em] ${
            active ? 'text-[#aaa79e]' : 'text-[#66645c]'
          }`}
        >
          {nameChanges} name · {regionChanges} region
        </span>
      </span>
    </button>
  )
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 bg-[#f2f1ec] px-4 py-3.5 sm:px-5">
    <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#66645c]">{label}</dt>
    <dd className="mt-1.5 truncate text-[15px] font-medium tabular-nums tracking-[-0.01em] sm:text-[17px]">
      {value}
    </dd>
  </div>
)

const EvidenceBlock = ({ link }: { link: PlayerDetail['links'][number] }) => {
  const copy = methodCopy[link.method]
  const anonymous = link.anonymous
  const art = cardArt(anonymous.cardId)
  const matchUrl = link.matchId ? `https://vtl.lol/match/${link.matchId}` : null
  const facts = [
    { label: 'Rank', value: `#${formatCount(anonymous.leaderboardRank)}` },
    { label: 'RR', value: formatCount(anonymous.rankedRating) },
    { label: 'Wins', value: formatCount(anonymous.numberOfWins) },
    { label: 'Tier', value: formatCount(anonymous.competitiveTier) },
    { label: 'Region', value: regionLabel(anonymous.region) },
    { label: 'Act', value: anonymous.seasonName ?? anonymous.seasonId },
  ]

  return (
    <div className="border-t border-[#d6d3c9] pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[15px] font-medium tracking-[-0.01em]">{copy.title}</h4>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] tabular-nums text-[#66645c]">
          {(link.confidence / 100).toFixed(2)}% confidence
        </span>
      </div>
      <p className="mt-1.5 max-w-xl text-[11px] leading-5 text-[#66645c]">{copy.detail}</p>

      <dl className="mt-3 grid grid-cols-2 gap-px border border-[#d6d3c9] bg-[#d6d3c9] sm:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0 bg-[#f2f1ec] px-2.5 py-2">
            <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#66645c]">
              {fact.label}
            </dt>
            <dd className="mt-1 break-all font-mono text-[10px] leading-4 tabular-nums">
              {fact.value}
            </dd>
          </div>
        ))}

        <div className="min-w-0 bg-[#f2f1ec] px-2.5 py-2">
          <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#66645c]">Card</dt>
          <dd className="mt-1 flex items-center gap-2">
            {art ? (
              <a
                href={art}
                target="_blank"
                rel="noreferrer noopener"
                className="block h-[30px] w-6 shrink-0 border border-[#171714]"
                style={{ backgroundColor: cardAccent(anonymous.cardId) }}
              >
                <img
                  src={art}
                  alt=""
                  width={24}
                  height={30}
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  className="h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none'
                  }}
                />
              </a>
            ) : null}
            <span
              className="truncate font-mono text-[9px] tabular-nums text-[#66645c]"
              title={anonymous.cardId}
            >
              {anonymous.cardId.slice(0, 8)}
            </span>
          </dd>
        </div>
      </dl>

      <div className="mt-3 space-y-1 font-mono text-[9px] leading-4">
        {matchUrl ? (
          <p className="break-all">
            <span className="text-[#66645c]">Match / </span>
            <a
              href={matchUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-[#c9c6bc] underline-offset-4 hover:decoration-[#c4291c]"
            >
              {matchUrl}
            </a>
          </p>
        ) : (
          <p className="text-[#66645c]">No match lookup required.</p>
        )}
        <p className="text-[#66645c]">Linked {formatDateTime(link.createdAt)}</p>
      </div>
    </div>
  )
}

const RecordBar = ({
  puuid,
  name,
  tag,
  onBack,
}: {
  readonly puuid: string | null
  readonly name: string
  readonly tag: string
  readonly onBack?: () => void
}) => (
  <div className="flex h-10 shrink-0 items-center justify-between gap-4 border-b border-[#171714] px-4 sm:px-6">
    <div className="flex min-w-0 items-center gap-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex shrink-0 items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] underline decoration-[#c9c6bc] underline-offset-4 hover:decoration-[#c4291c] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#c4291c] lg:hidden"
        >
          <ArrowLeftIcon className="size-3" />
          Index
        </button>
      ) : null}
      <span className="hidden truncate font-mono text-[9px] uppercase tracking-[0.16em] text-[#66645c] lg:block">
        Record / {puuid ? puuid.slice(0, 8).toUpperCase() : 'none'}
      </span>
      <span className="truncate font-mono text-[9px] uppercase tracking-[0.16em] text-[#66645c] sm:hidden">
        {puuid ? puuid.slice(0, 8).toUpperCase() : 'Awaiting selection'}
      </span>
    </div>

    {puuid ? (
      <div className="flex shrink-0 items-center gap-3 font-mono text-[9px] uppercase tracking-[0.14em] sm:gap-4">
        {name && tag ? (
          <a
            href={trackerProfileUrl(name, tag)}
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-[#c9c6bc] underline-offset-4 hover:decoration-[#c4291c]"
          >
            tracker.gg ↗
          </a>
        ) : null}
        <a
          href={vtlProfileUrl(puuid)}
          target="_blank"
          rel="noreferrer noopener"
          className="underline decoration-[#c9c6bc] underline-offset-4 hover:decoration-[#c4291c]"
        >
          vtl.lol ↗
        </a>
      </div>
    ) : (
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#66645c]">
        Master index
      </span>
    )}
  </div>
)

const EmptyRecord = () => (
  <div className="flex min-h-0 flex-1 flex-col">
    <RecordBar puuid={null} name="" tag="" />

    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-1 flex-col justify-center px-5 py-10 sm:px-8 lg:px-12">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c4291c]">
          00 / No record
        </p>
        <h2 className="mt-5 max-w-lg text-[2.5rem] leading-[0.92] font-medium tracking-[-0.05em] sm:text-6xl">
          Select a
          <br />
          player record<span className="text-[#c4291c]">.</span>
        </h2>
        <p className="mt-5 max-w-md text-[12px] leading-6 text-[#66645c]">
          Choose a row from the index to inspect every name, regional transfer, and ban interval,
          plus the evidence that connects the record.
        </p>
      </div>

      <div className="border-t border-[#171714] px-5 py-5 sm:px-8 lg:px-12">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="flex items-center gap-1">
              <Key>J</Key>
              <Key>K</Key>
            </dt>
            <dd className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#66645c]">
              Move selection
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1">
              <Key>/</Key>
            </dt>
            <dd className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#66645c]">
              Focus search
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1">
              <Key>Esc</Key>
            </dt>
            <dd className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#66645c]">
              Clear
            </dd>
          </div>
        </dl>
      </div>
    </div>
  </div>
)

const RecordPanel = ({
  puuid,
  row,
  cardId,
  onBack,
}: {
  readonly puuid: string
  readonly row: IndexRow | null
  readonly cardId: string | null
  readonly onBack: () => void
}) => {
  const query = useQuery({
    queryKey: ['player', puuid],
    queryFn: () => fetchPlayer(puuid),
  })

  const detail = query.data
  const flags = row?.[P.flags] ?? 0
  const name = detail?.player.name ?? row?.[P.name] ?? ''
  const tag = detail?.player.tag ?? row?.[P.tag] ?? ''
  const region = detail?.player.region ?? row?.[P.region] ?? null
  const resolvedCardId = detail?.player.cardId ?? cardId
  const art = cardArt(resolvedCardId)
  const isAnonymized = detail?.player.isAnonymized ?? Boolean(flags & FLAG.anonymized)
  const isBanned = detail?.player.isBanned ?? false
  const hasBanHistory = Boolean(flags & FLAG.banHistory) || (detail?.player.banCount ?? 0) > 0

  const firstSeen = detail?.player.firstSeenAt ?? row?.[P.firstSeenAt] ?? null
  const lastSeen = detail?.player.lastSeenAt ?? row?.[P.lastSeenAt] ?? null
  const lastNameChange = detail?.player.lastNameChangeAt ?? row?.[P.lastNameChangeAt] ?? null

  const nameEntries: IntervalEntry[] = detail
    ? [...detail.names].reverse().map((interval, index) => ({
        key: `name-${interval.startedAt}-${index}`,
        title: `${interval.name}#${interval.tag}`,
        meta: null,
        startedAt: interval.startedAt,
        endedAt: interval.endedAt,
      }))
    : []

  const regionEntries: IntervalEntry[] = detail
    ? [...detail.regions].reverse().map((interval, index) => ({
        key: `region-${interval.startedAt}-${index}`,
        title: regionLabel(interval.region),
        meta: regionShort(interval.region),
        startedAt: interval.startedAt,
        endedAt: interval.endedAt,
      }))
    : []

  const banEntries: IntervalEntry[] = detail
    ? [...detail.bans].reverse().map((interval, index) => ({
        key: `ban-${interval.startedAt}-${index}`,
        title: interval.endedAt === null ? 'Banned' : 'Banned, then unbanned',
        meta: null,
        startedAt: interval.startedAt,
        endedAt: interval.endedAt,
      }))
    : []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordBar puuid={puuid} name={name} tag={tag} onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 pb-6 pt-6 sm:px-8 lg:px-10">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#66645c]">
                Public competitive record
              </p>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="break-words text-[2.25rem] leading-[0.92] font-medium tracking-[-0.05em] sm:text-[2.75rem] lg:text-[3.25rem]">
                  {name || 'Anonymous'}
                </h2>
                {tag ? (
                  <span className="font-mono text-[12px] text-[#66645c] sm:text-[14px]">
                    #{tag}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#66645c]">
                <span className="text-[#171714]">
                  {regionLabel(region)} / {regionShort(region)}
                </span>
                <span aria-hidden>·</span>
                {isAnonymized ? (
                  <>
                    <span>Anonymized source</span>
                    <span aria-hidden>·</span>
                  </>
                ) : null}
                {isBanned ? (
                  <span className="text-[#c4291c]">Currently banned</span>
                ) : hasBanHistory ? (
                  <span>Ban history on record</span>
                ) : (
                  <span>No ban interval</span>
                )}
              </div>
            </div>

            {art ? (
              <figure className="hidden shrink-0 sm:block">
                <span
                  className="block h-[90px] w-[72px] overflow-hidden border border-[#171714]"
                  style={{ backgroundColor: cardAccent(resolvedCardId) }}
                >
                  <img
                    src={art}
                    alt=""
                    width={72}
                    height={90}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    className="h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                </span>
                <figcaption className="mt-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-[#66645c]">
                  Player card
                </figcaption>
              </figure>
            ) : null}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px border-y border-[#171714] bg-[#d6d3c9] sm:grid-cols-4">
          <Stat label="First observed" value={formatDate(firstSeen)} />
          <Stat label="Last observed" value={formatRelative(lastSeen)} />
          <Stat label="Observations" value={formatCount(detail?.player.timesSeen)} />
          <Stat label="Name changed" value={formatDate(lastNameChange)} />
        </dl>

        {isBanned ? (
          <div className="flex items-start gap-2 border-b border-[#171714] px-5 py-3 sm:px-8 lg:px-10">
            <span className="mt-[6px] block size-1.5 shrink-0 bg-[#c4291c]" aria-hidden />
            <p className="text-[11px] leading-5 text-[#66645c]">
              <span className="mr-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#c4291c]">
                Banned
              </span>
              The competitive leaderboard currently carries a ban flag. Identity history is
              retained.
            </p>
          </div>
        ) : null}

        {query.isPending ? (
          <div className="flex items-center gap-2 border-b border-[#d6d3c9] px-5 py-4 font-mono text-[9px] uppercase tracking-[0.14em] text-[#66645c] sm:px-8 lg:px-10">
            <span className="block size-1.5 animate-pulse bg-[#c4291c]" aria-hidden />
            Retrieving interval history
          </div>
        ) : null}

        {query.isError ? (
          <div className="border-b border-[#171714] px-5 py-6 sm:px-8 lg:px-10">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c4291c]">
              Record unavailable
            </p>
            <p className="mt-2 text-[11px] leading-5 text-[#66645c]">{query.error.message}</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-3 border-b border-[#171714] pb-0.5 font-mono text-[9px] uppercase tracking-[0.14em] hover:text-[#c4291c] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#c4291c]"
            >
              Retry request
            </button>
          </div>
        ) : null}

        {detail ? (
          <>
            <DetailSection number="01" title="Name history" meta={formatCount(detail.names.length)}>
              <IntervalList entries={nameEntries} empty="No name interval recorded" />
            </DetailSection>

            <DetailSection
              number="02"
              title="Region history"
              meta={formatCount(detail.regions.length)}
            >
              <IntervalList entries={regionEntries} empty="No region interval recorded" />
            </DetailSection>

            <DetailSection number="03" title="Ban history" meta={formatCount(detail.bans.length)}>
              <IntervalList entries={banEntries} empty="No ban interval observed" />
            </DetailSection>

            <DetailSection number="04" title="Counters" meta="All time">
              <dl className="grid grid-cols-2 gap-px border border-[#d6d3c9] bg-[#d6d3c9] sm:grid-cols-4">
                {[
                  { label: 'Name changes', value: detail.player.nameChanges },
                  { label: 'Region changes', value: detail.player.regionChanges },
                  { label: 'Bans', value: detail.player.banCount },
                  { label: 'Unbans', value: detail.player.unbanCount },
                ].map((counter) => (
                  <div key={counter.label} className="min-w-0 bg-[#f2f1ec] px-4 py-3.5">
                    <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#66645c]">
                      {counter.label}
                    </dt>
                    <dd
                      className={`mt-2 text-[28px] leading-none font-medium tabular-nums tracking-[-0.04em] ${
                        counter.label === 'Bans' && counter.value > 0 ? 'text-[#c4291c]' : ''
                      }`}
                    >
                      {formatCount(counter.value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </DetailSection>

            <DetailSection
              number="05"
              title="Identity evidence"
              meta={formatCount(detail.links.length)}
            >
              {detail.links.length === 0 ? (
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#66645c]">
                  No identity evidence linked yet
                </p>
              ) : (
                <div className="space-y-5">
                  {detail.links.map((link, index) => (
                    <EvidenceBlock key={`${link.matchId ?? 'direct'}-${index}`} link={link} />
                  ))}
                </div>
              )}
            </DetailSection>

            <footer className="border-t border-[#171714] px-5 py-4 sm:px-8 lg:px-10">
              <div className="flex flex-col gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#66645c] sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                <span className="break-all normal-case tracking-normal">Puuid / {puuid}</span>
                <span className="shrink-0">
                  Last name change / {formatDateTime(lastNameChange)}
                </span>
              </div>
            </footer>
          </>
        ) : null}
      </div>
    </div>
  )
}

export function DesignOnePage() {
  const searchRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoSelected = useRef(false)
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [region, setRegion] = useState<'all' | Region>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const deferredSearch = useDeferredValue(search)

  const index = useQuery({ queryKey: ['index'], queryFn: fetchIndex })

  const rows = useMemo(() => {
    const all = index.data?.players ?? []
    const needle = deferredSearch.trim().toLowerCase()

    return [...all]
      .filter((row) => {
        if (region !== 'all' && row[P.region] !== region) return false
        if (!needle) return true
        return (
          row[P.name].toLowerCase().includes(needle) ||
          row[P.tag].toLowerCase().includes(needle) ||
          `${row[P.name]}#${row[P.tag]}`.toLowerCase().includes(needle) ||
          row[P.puuid].toLowerCase().includes(needle)
        )
      })
      .sort((left, right) => right[P.lastSeenAt] - left[P.lastSeenAt])
  }, [index.data, deferredSearch, region])

  const selectedRow = useMemo(
    () =>
      selected ? (index.data?.players.find((row) => row[P.puuid] === selected) ?? null) : null,
    [index.data, selected],
  )

  const selectedCardIndex = selectedRow?.[P.cardId]
  const selectedCardId =
    selectedCardIndex === null || selectedCardIndex === undefined
      ? null
      : (index.data?.cards[selectedCardIndex] ?? null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  const selectedIndex = useMemo(
    () => (selected ? rows.findIndex((row) => row[P.puuid] === selected) : -1),
    [rows, selected],
  )

  useEffect(() => {
    if (autoSelected.current || rows.length === 0) return
    autoSelected.current = true
    if (!window.matchMedia('(min-width: 1024px)').matches) return
    const first = rows[0]
    if (first) setSelected(first[P.puuid])
  }, [rows])

  useEffect(() => {
    if (selectedIndex >= 0) {
      virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
    }
  }, [selectedIndex, virtualizer])

  useEffect(() => {
    virtualizer.scrollToOffset(0)
  }, [deferredSearch, region, virtualizer])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target

      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return

      const currentIndex = selected ? rows.findIndex((row) => row[P.puuid] === selected) : -1

      const move = (next: number) => {
        if (rows.length === 0) return
        const row = rows[Math.max(0, Math.min(rows.length - 1, next))]
        if (!row) return
        event.preventDefault()
        setSelected(row[P.puuid])
      }

      switch (event.key) {
        case '/':
          event.preventDefault()
          setMobileView('list')
          window.requestAnimationFrame(() => {
            searchRef.current?.focus()
            searchRef.current?.select()
          })
          break
        case 'ArrowDown':
        case 'j':
          move(currentIndex < 0 ? 0 : currentIndex + 1)
          break
        case 'ArrowUp':
        case 'k':
          move(currentIndex < 0 ? rows.length - 1 : currentIndex - 1)
          break
        case 'Home':
          move(0)
          break
        case 'End':
          move(rows.length - 1)
          break
        case 'Escape':
          event.preventDefault()
          if (selected) {
            setSelected(null)
            setMobileView('list')
          } else if (search) {
            setSearch('')
          } else {
            searchRef.current?.blur()
          }
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [rows, search, selected])

  const choose = (puuid: string) => {
    setSelected(puuid)
    setMobileView('detail')
  }

  const prefetch = (puuid: string) => {
    void queryClient.prefetchQuery({
      queryKey: ['player', puuid],
      queryFn: () => fetchPlayer(puuid),
    })
  }

  const resetFilters = () => {
    setSearch('')
    setRegion('all')
    searchRef.current?.focus()
  }

  const clearSearch = () => {
    setSearch('')
    searchRef.current?.focus()
  }

  const hasFilters = search.trim().length > 0 || region !== 'all'
  const isFiltering = search !== deferredSearch

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f2f1ec] font-sans text-[#171714] antialiased [color-scheme:light] selection:bg-[#c4291c] selection:text-[#f2f1ec]">
      <header className="shrink-0 border-b border-[#171714]">
        <div className="flex h-8 items-center justify-between gap-4 border-b border-[#d6d3c9] px-4 font-mono text-[9px] uppercase tracking-[0.18em] text-[#66645c] sm:px-6 lg:px-8">
          <span>Riot ID / public competitive record</span>
          <span className="hidden truncate sm:block">
            {index.data?.season?.name ?? 'Live index'} · Index{' '}
            {formatDate(index.data?.generatedAt ?? null)}
          </span>
        </div>

        <div className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-10 lg:px-8 lg:py-5">
          <div className="min-w-0">
            <h1 className="text-[2.25rem] leading-[0.88] font-medium tracking-[-0.055em] sm:text-[3rem] lg:text-[3.75rem]">
              Identity ledger<span className="text-[#c4291c]">.</span>
            </h1>
            <p className="mt-2 hidden max-w-lg text-[11px] leading-5 text-[#66645c] sm:block">
              A permanent master index of competitive names, regional transfers, and bans,
              reconstructed from public leaderboards.
            </p>
            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#66645c] sm:hidden">
              {formatCount(index.data?.stats.players)} records ·{' '}
              {formatRelative(index.data?.stats.lastRunAt ?? null)}
            </p>
          </div>

          <dl className="hidden items-end sm:flex">
            <div className="border-l border-[#d6d3c9] pl-5">
              <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#66645c]">
                Records
              </dt>
              <dd className="mt-1 font-mono text-[16px] leading-none tabular-nums">
                {formatCount(index.data?.stats.players)}
              </dd>
            </div>
            <div className="border-l border-[#d6d3c9] pl-5">
              <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#66645c]">
                Name changes
              </dt>
              <dd className="mt-1 font-mono text-[16px] leading-none tabular-nums">
                {formatCount(index.data?.stats.nameChanges)}
              </dd>
            </div>
            <div className="border-l border-[#d6d3c9] pl-5">
              <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#66645c]">
                Last sync
              </dt>
              <dd className="mt-1 font-mono text-[11px] leading-none text-[#171714]">
                {formatRelative(index.data?.stats.lastRunAt ?? null)}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[26rem_minmax(0,1fr)] xl:grid-cols-[28rem_minmax(0,1fr)]">
        <section
          className={`min-h-0 min-w-0 flex-1 flex-col border-[#171714] lg:flex lg:border-r ${
            mobileView === 'detail' ? 'hidden' : 'flex'
          }`}
        >
          <div className="shrink-0 px-4 pt-4 sm:px-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#66645c]">
                Player index
              </h2>
              <p aria-live="polite" className="font-mono text-[9px] tabular-nums text-[#66645c]">
                {formatCount(rows.length)} / {formatCount(index.data?.players.length)}
              </p>
            </div>

            <div className="mt-3 flex h-10 items-center gap-2 border-b border-[#171714] focus-within:border-[#c4291c]">
              <SearchIcon className="size-3.5 shrink-0 text-[#66645c]" />
              <input
                ref={searchRef}
                type="text"
                inputMode="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    if (search) {
                      setSearch('')
                    } else if (selected) {
                      setSelected(null)
                      setMobileView('list')
                    } else {
                      event.currentTarget.blur()
                    }
                    return
                  }

                  if (event.key === 'ArrowDown' || event.key === 'Enter') {
                    const first = rows[0]
                    if (!first) return
                    event.preventDefault()
                    setSelected(first[P.puuid])
                    if (event.key === 'Enter') {
                      setMobileView('detail')
                    } else {
                      event.currentTarget.blur()
                    }
                  }
                }}
                placeholder="Search name, tag, or puuid"
                aria-label="Search players"
                aria-controls="player-index-list"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-[#171714] outline-none placeholder:text-[#77746b]"
              />
              {search ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear search"
                  className="shrink-0 font-sans text-[16px] leading-none text-[#66645c] hover:text-[#171714] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#c4291c]"
                >
                  ×
                </button>
              ) : (
                <Key>/</Key>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-1"
                role="group"
                aria-label="Filter by region"
              >
                {regions.map((item) => {
                  const active = region === item.value

                  return (
                    <button
                      key={item.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setRegion(item.value)}
                      className={`relative pb-1 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#c4291c] ${
                        active ? 'text-[#171714]' : 'text-[#66645c] hover:text-[#171714]'
                      }`}
                    >
                      {item.label}
                      {active ? (
                        <span
                          className="absolute inset-x-0 bottom-0 h-px bg-[#c4291c]"
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  )
                })}
              </div>
              <span className="hidden shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-[#66645c] sm:block">
                By last seen
              </span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-[1.75rem_2rem_minmax(0,1fr)_7rem] items-center gap-2 border-y border-[#171714] px-4 py-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-[#66645c] sm:gap-3 sm:px-6">
            <span>No.</span>
            <span aria-hidden />
            <span>Player / region</span>
            <span className="text-right">Seen / changes</span>
          </div>

          <div
            ref={scrollRef}
            id="player-index-list"
            role="region"
            aria-label="Player index results"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            {index.isPending ? (
              <div className="px-4 py-8 sm:px-6">
                <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#66645c]">
                  <span className="block size-1.5 animate-pulse bg-[#c4291c]" aria-hidden />
                  Retrieving public index
                </p>
                <p className="mt-2 text-[11px] leading-5 text-[#66645c]">
                  The ledger is being assembled.
                </p>
              </div>
            ) : index.isError && !index.data ? (
              <div className="px-4 py-8 sm:px-6">
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c4291c]">
                  Index unavailable
                </p>
                <p className="mt-2 text-[11px] leading-5 text-[#66645c]">{index.error.message}</p>
                <button
                  type="button"
                  onClick={() => void index.refetch()}
                  className="mt-3 border-b border-[#171714] pb-0.5 font-mono text-[9px] uppercase tracking-[0.14em] hover:text-[#c4291c] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#c4291c]"
                >
                  Retry index
                </button>
              </div>
            ) : rows.length === 0 ? (
              <div className="px-4 py-8 sm:px-6">
                <p className="text-[12px] leading-5">
                  {hasFilters
                    ? 'No records match the current filters.'
                    : 'The public index contains no players.'}
                </p>
                {hasFilters ? (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-3 border-b border-[#171714] pb-0.5 font-mono text-[9px] uppercase tracking-[0.14em] hover:text-[#c4291c] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#c4291c]"
                  >
                    Clear search and region
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map((item) => {
                  const row = rows[item.index]
                  if (!row) return null

                  return (
                    <PlayerRow
                      key={row[P.puuid]}
                      row={row}
                      cards={index.data?.cards ?? []}
                      position={item.index}
                      active={row[P.puuid] === selected}
                      top={item.start}
                      onChoose={choose}
                      onPrefetch={prefetch}
                    />
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#171714] px-4 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-[#66645c] sm:px-6">
            <span className={`truncate ${index.isError ? 'text-[#c4291c]' : ''}`}>
              {index.isError
                ? 'API offline'
                : index.isFetching
                  ? 'Syncing'
                  : isFiltering
                    ? 'Filtering'
                    : `Synced ${formatRelative(index.data?.stats.lastRunAt ?? null)}`}
            </span>
            <span className="hidden shrink-0 sm:block">J/K move · / search · Esc clear</span>
          </div>
        </section>

        <section
          className={`min-h-0 min-w-0 flex-1 flex-col lg:flex ${
            mobileView === 'detail' ? 'flex' : 'hidden'
          }`}
        >
          {selected ? (
            <RecordPanel
              key={selected}
              puuid={selected}
              row={selectedRow}
              cardId={selectedCardId}
              onBack={() => setMobileView('list')}
            />
          ) : (
            <EmptyRecord />
          )}
        </section>
      </div>
    </div>
  )
}
