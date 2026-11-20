import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'

import {
  cardArt,
  displayName,
  formatRelative,
  regionLabel,
  regionShort,
  type PlayerListItem,
  type PlayerSection,
} from '../lib/api.ts'
import { CardArt } from './card-art.tsx'
import { EmptyState } from './ui.tsx'
import { PlayerListSkeleton, Skeleton } from './skeleton.tsx'

type Props = {
  readonly sections: ReadonlyArray<PlayerSection>
  readonly selected: string | null
  readonly loading: boolean
  readonly emptyTitle: string
  readonly emptyHint: string
  readonly hasMore: boolean
  readonly loadingMore: boolean
  readonly pendingCount: number
  readonly onLoadMore: () => void
  readonly focusSelectedOnMount: boolean
  readonly searchRef: RefObject<HTMLInputElement | null>
  readonly onSelect: (puuid: string | null) => void
  readonly onPrefetch: (puuid: string) => void
  readonly onEscape: () => void
}

type HeaderItem = {
  readonly kind: 'header'
  readonly key: string
  readonly label: string
  readonly total: number
  readonly truncated: boolean
  readonly shown: number
}

type PlayerItem = {
  readonly kind: 'player'
  readonly key: string
  readonly player: PlayerListItem
}

type PlaceholderItem = {
  readonly kind: 'placeholder'
  readonly key: string
}

type ListItem = HeaderItem | PlayerItem | PlaceholderItem

const interactiveRoles =
  '[data-slot="select-trigger"],[role="combobox"],[role="radiogroup"],[role="toolbar"],[role="list"],[role="menu"],[role="listbox"],[role="dialog"],[role="separator"]'

const navigationKeys = new Set(['ArrowDown', 'ArrowUp', 'j', 'k', 'Home', 'End'])

const buildItems = (sections: ReadonlyArray<PlayerSection>, pendingCount: number): ListItem[] => {
  const items: ListItem[] = sections.flatMap((section) => [
    ...(section.label
      ? [
          {
            kind: 'header' as const,
            key: `section-${section.id}`,
            label: section.label,
            total: section.total,
            truncated: section.truncated,
            shown: section.players.length,
          },
        ]
      : []),
    ...section.players.map((player) => ({
      kind: 'player' as const,
      key: `${section.id}:${player.puuid}`,
      player,
    })),
  ])

  for (let index = 0; index < pendingCount; index += 1) {
    items.push({ kind: 'placeholder', key: `placeholder-${index}` })
  }

  return items
}

export const PlayerList = ({
  sections,
  selected,
  loading,
  emptyTitle,
  emptyHint,
  hasMore,
  loadingMore,
  pendingCount,
  onLoadMore,
  focusSelectedOnMount,
  searchRef,
  onSelect,
  onPrefetch,
  onEscape,
}: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const hoverTimer = useRef<number | null>(null)
  const cancelHover = () => {
    if (hoverTimer.current === null) return
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = null
  }
  useEffect(() => cancelHover, [])
  const pendingFocus = useRef<string | null>(null)
  const focusedOnMount = useRef(false)
  const [keyboardNavigation, setKeyboardNavigation] = useState(false)
  const items = useMemo(() => buildItems(sections, pendingCount), [sections, pendingCount])
  const firstPlayerIndex = items.findIndex((item) => item.kind === 'player')
  // TanStack Virtual returns functions the compiler cannot safely memoize.
  // eslint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (items[index]?.kind === 'header' ? 34 : 56),
    getItemKey: (index) => items[index]?.key ?? index,
    overscan: 8,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const loadedPlayers = sections.reduce((total, section) => total + section.players.length, 0)

  useEffect(() => {
    if (!hasMore || loadingMore || loadedPlayers === 0) return
    const last = virtualItems.at(-1)
    if (last && last.index >= loadedPlayers - 80) onLoadMore()
  }, [virtualItems, hasMore, loadingMore, loadedPlayers, onLoadMore])

  const selectedIndex = items.findIndex(
    (item) => item.kind === 'player' && item.player.puuid === selected,
  )
  const activeItem = selectedIndex >= 0 ? (items[selectedIndex] ?? null) : null
  const activePlayer = activeItem?.kind === 'player' ? activeItem.player : null

  useEffect(() => {
    if (selectedIndex >= 0) {
      virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
    }
  }, [selectedIndex, virtualizer])

  useEffect(() => {
    if (focusedOnMount.current || !focusSelectedOnMount || !selected) return
    const frame = window.requestAnimationFrame(() => {
      focusedOnMount.current = true
      if (!window.matchMedia('(min-width: 1024px)').matches) return
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-puuid="${CSS.escape(selected)}"]`)
        ?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusSelectedOnMount, selected])

  useEffect(() => {
    const pending = pendingFocus.current
    if (!pending) return
    if (!window.matchMedia('(min-width: 1024px)').matches) {
      pendingFocus.current = null
      return
    }

    const element = scrollRef.current?.querySelector<HTMLElement>(
      `[data-puuid="${CSS.escape(pending)}"]`,
    )
    if (element) {
      element.focus({ preventScroll: true })
      pendingFocus.current = null
    }
  })

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return

      const target = event.target instanceof Element ? event.target : null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          (target as HTMLElement).isContentEditable ||
          target.closest(interactiveRoles))
      ) {
        return
      }

      const playerAt = (index: number): PlayerItem | null => {
        const item = items[index]
        return item?.kind === 'player' ? item : null
      }

      const playerAfter = (index: number, delta: number): PlayerItem | null => {
        for (let next = index + delta; next >= 0 && next < items.length; next += delta) {
          const player = playerAt(next)
          if (player) return player
        }
        return null
      }

      const move = (player: PlayerItem | null) => {
        if (!player || player.player.puuid === selected) return
        event.preventDefault()
        if (target?.closest('[data-player-row]')) pendingFocus.current = player.player.puuid
        onSelect(player.player.puuid)
      }

      if (navigationKeys.has(event.key)) setKeyboardNavigation(true)

      switch (event.key) {
        case '/':
          event.preventDefault()
          searchRef.current?.focus()
          break
        case 'ArrowDown':
        case 'j':
          move(selectedIndex < 0 ? playerAt(firstPlayerIndex) : playerAfter(selectedIndex, 1))
          break
        case 'ArrowUp':
        case 'k':
          move(selectedIndex < 0 ? playerAfter(items.length, -1) : playerAfter(selectedIndex, -1))
          break
        case 'Home':
          move(playerAt(firstPlayerIndex))
          break
        case 'End':
          move(playerAfter(items.length, -1))
          break
        case 'Escape':
          onEscape()
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [items, selectedIndex, firstPlayerIndex, selected, onSelect, onEscape, searchRef])

  if (loading) return <PlayerListSkeleton />
  if (items.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={cancelHover}
        onPointerDown={() => setKeyboardNavigation(false)}
        onPointerMove={() => setKeyboardNavigation(false)}
        className="h-full overflow-y-auto overscroll-contain"
      >
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualItems.map((item) => {
            const row = items[item.index]
            if (!row) return null

            if (row.kind === 'placeholder') {
              return (
                <div
                  key={row.key}
                  aria-hidden="true"
                  data-list-placeholder
                  className="absolute top-0 left-0 flex h-14 w-full items-center gap-3 border-b border-white/[0.05] px-3"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <Skeleton className="size-9 shrink-0 rounded-sm" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-2.5 w-24" />
                  </div>
                  <Skeleton className="h-2.5 w-12" />
                </div>
              )
            }

            if (row.kind === 'header') {
              const count = row.truncated
                ? `${row.shown.toLocaleString()}+`
                : row.total.toLocaleString()

              return (
                <h3
                  key={row.key}
                  className="absolute top-0 left-0 flex h-[34px] w-full items-end gap-3 border-b border-white/[0.06] bg-ink px-4 pb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <span>{row.label}</span>
                  <span className="ms-auto tabular-nums text-zinc-500">{count}</span>
                </h3>
              )
            }

            const player = row.player
            const active = player.puuid === selected
            const past = player.former
            const rowName = past ? past.name : player.name
            const rowTag = past ? past.tag : player.tag
            const art = cardArt(player.cardId)

            return (
              <button
                key={row.key}
                type="button"
                data-player-row
                data-puuid={player.puuid}
                data-selected={active}
                aria-current={active ? 'true' : undefined}
                tabIndex={active || (selectedIndex < 0 && item.index === firstPlayerIndex) ? 0 : -1}
                onClick={() => onSelect(player.puuid)}
                onPointerEnter={(event) => {
                  if (event.pointerType === 'touch') return
                  cancelHover()
                  hoverTimer.current = window.setTimeout(() => {
                    hoverTimer.current = null
                    onPrefetch(player.puuid)
                  }, 120)
                }}
                onPointerLeave={cancelHover}
                onPointerDown={(event) => {
                  if (event.pointerType === 'mouse') onPrefetch(player.puuid)
                }}
                className={`absolute top-0 left-0 flex h-14 w-full items-center gap-3 border-b border-white/[0.05] py-2 pr-4 pl-3 text-left focus-visible:outline-none data-[selected=true]:bg-white/10 ${
                  keyboardNavigation ? '' : 'hover:bg-white/[0.035]'
                }`}
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <CardArt
                  art={art}
                  name={rowName}
                  width={36}
                  height={36}
                  fetchPriority="low"
                  className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-white/[0.06] bg-white/[0.03] font-mono text-[12px] text-zinc-400"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="truncate text-[16px] font-medium tracking-tight text-zinc-100">
                      {rowName || 'Anonymous'}
                    </span>
                    {rowTag ? (
                      <span className="shrink-0 font-mono text-xs font-medium text-zinc-300">
                        #{rowTag}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex min-w-0 items-center gap-2 font-mono text-[12px] text-zinc-400">
                    <span className="shrink-0">{regionShort(player.region)}</span>
                    {past ? (
                      <>
                        <span className="shrink-0 text-zinc-500">now</span>
                        <span
                          className="truncate text-zinc-300"
                          title={`${player.name}#${player.tag}`}
                        >
                          {player.name || 'Anonymous'}
                          {player.tag ? `#${player.tag}` : ''}
                        </span>
                      </>
                    ) : (
                      <>
                        {player.nameChanges > 0 ? (
                          <span className="shrink-0">{player.nameChanges} name</span>
                        ) : null}
                        {player.regionChanges > 0 ? (
                          <span className="shrink-0">{player.regionChanges} region</span>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>

                <div className="shrink-0 font-mono text-[12px] text-zinc-400 tabular-nums">
                  {formatRelative(player.lastSeenAt)}
                </div>
              </button>
            )
          })}
        </div>
      </div>
      <p role="status" className="sr-only">
        {loadingMore ? 'Loading more players…' : ''}
      </p>
      <p role="status" className="sr-only">
        {activePlayer
          ? activePlayer.former
            ? `Selected ${activePlayer.former.name}#${activePlayer.former.tag}, now ${displayName(activePlayer)}, ${regionLabel(activePlayer.region)}`
            : `Selected ${displayName(activePlayer)}, ${regionLabel(activePlayer.region)}`
          : ''}
      </p>
    </>
  )
}
