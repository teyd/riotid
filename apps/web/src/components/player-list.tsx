import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, type RefObject } from 'react'

import { FLAG, formatRelative, P, regionShort, type IndexRow } from '../lib/api.ts'
import { Dot, EmptyState, LoadingState } from './ui.tsx'

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
    estimateSize: () => 44,
    overscan: 14,
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
          const flags = row[P.flags]
          const region = row[P.region]
          const active = puuid === selected
          const name = row[P.name]
          const tag = row[P.tag]

          return (
            <button
              key={puuid}
              type="button"
              data-selected={active}
              onClick={() => onSelect(puuid)}
              onMouseEnter={() => onPrefetch(puuid)}
              onFocus={() => onPrefetch(puuid)}
              className="absolute top-0 left-0 flex h-11 w-full items-center gap-3 border-b border-white/[0.04] px-4 text-left transition-colors hover:bg-white/[0.035] focus-visible:bg-white/[0.05] focus-visible:outline-none data-[selected=true]:bg-white/[0.06]"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <div className="flex w-3 shrink-0 items-center justify-center gap-1">
                {flags & FLAG.anonymized ? <Dot tone="info" /> : null}
                {flags & FLAG.banHistory ? <Dot tone="warn" /> : null}
                {flags === 0 ? <Dot tone="muted" /> : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="truncate text-[13px] font-medium text-zinc-100">
                    {name || 'Anonymous'}
                  </span>
                  {tag ? (
                    <span className="shrink-0 font-mono text-[10px] text-zinc-500">#{tag}</span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-zinc-500">
                  <span>{regionShort(region)}</span>
                  {row[P.nameChanges] > 0 ? (
                    <span className="text-sky-400/80">{row[P.nameChanges]} name</span>
                  ) : null}
                  {row[P.regionChanges] > 0 ? (
                    <span className="text-emerald-400/80">{row[P.regionChanges]} region</span>
                  ) : null}
                  {flags & FLAG.anonymized ? <span className="text-sky-300/80">linked</span> : null}
                </div>
              </div>

              <div className="shrink-0 font-mono text-[10px] text-zinc-600">
                {formatRelative(row[P.lastSeenAt])}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
