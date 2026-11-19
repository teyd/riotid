import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, type RefObject } from 'react'

import { cardAccent, cardArt, formatRelative, P, regionShort, type IndexRow } from '../lib/api.ts'
import { EmptyState, LoadingState } from './ui.tsx'

type Props = {
  readonly rows: ReadonlyArray<IndexRow>
  readonly selected: string | null
  readonly loading: boolean
  readonly searchRef: RefObject<HTMLInputElement | null>
  readonly onSelect: (puuid: string | null) => void
  readonly onPrefetch: (puuid: string) => void
  readonly onEscape: () => void
}

export const PlayerList = ({
  rows,
  selected,
  loading,
  searchRef,
  onSelect,
  onPrefetch,
  onEscape,
}: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 8,
  })

  const selectedIndex = selected ? rows.findIndex((row) => row[P.puuid] === selected) : -1

  useEffect(() => {
    if (selectedIndex >= 0) {
      virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
    }
  }, [selectedIndex, virtualizer])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null

      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      const move = (next: number) => {
        const bounded = Math.max(0, Math.min(rows.length - 1, next))
        const row = rows[bounded]
        if (row) {
          event.preventDefault()
          onSelect(row[P.puuid])
        }
      }

      switch (event.key) {
        case '/':
          event.preventDefault()
          searchRef.current?.focus()
          break
        case 'ArrowDown':
        case 'j':
          move(selectedIndex < 0 ? 0 : selectedIndex + 1)
          break
        case 'ArrowUp':
        case 'k':
          move(selectedIndex < 0 ? rows.length - 1 : selectedIndex - 1)
          break
        case 'Home':
          move(0)
          break
        case 'End':
          move(rows.length - 1)
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
  }, [rows, selectedIndex, onSelect, onEscape, searchRef])

  if (loading) return <LoadingState label="Loading players" />
  if (rows.length === 0) {
    return <EmptyState title="No players match." hint="Try a different name, tag, or region." />
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index]
          if (!row) return null
          const puuid = row[P.puuid]
          const region = row[P.region]
          const active = puuid === selected
          const name = row[P.name]
          const tag = row[P.tag]

          const cardId = row[P.cardId]
          const art = cardArt(cardId)

          return (
            <button
              key={puuid}
              type="button"
              data-selected={active}
              onClick={() => onSelect(puuid)}
              onMouseEnter={() => onPrefetch(puuid)}
              onFocus={() => onPrefetch(puuid)}
              className="absolute top-0 left-0 flex h-14 w-full items-center gap-3 border-b border-white/[0.05] py-2 pr-4 pl-3 text-left transition-colors hover:bg-white/[0.035] focus-visible:bg-white/[0.05] focus-visible:outline-none data-[selected=true]:bg-white/[0.065]"
              style={{
                transform: `translateY(${item.start}px)`,
                boxShadow: `inset 3px 0 0 ${active ? cardAccent(cardId) : 'transparent'}`,
              }}
            >
              <span
                className="relative block h-10 w-8 shrink-0 overflow-hidden rounded-sm bg-white/[0.06]"
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

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="truncate text-[15px] font-medium tracking-tight text-zinc-100">
                    {name || 'Anonymous'}
                  </span>
                  {tag ? (
                    <span className="shrink-0 font-mono text-xs text-zinc-500">#{tag}</span>
                  ) : null}
                </div>
                <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                  <span>{regionShort(region)}</span>
                  {row[P.nameChanges] > 0 ? <span>{row[P.nameChanges]} name</span> : null}
                  {row[P.regionChanges] > 0 ? <span>{row[P.regionChanges]} region</span> : null}
                </div>
              </div>

              <div className="shrink-0 font-mono text-[11px] text-zinc-600 tabular-nums">
                {formatRelative(row[P.lastSeenAt])}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
