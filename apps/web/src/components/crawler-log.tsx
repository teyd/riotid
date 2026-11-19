import { CodePanel } from './code-panel.tsx'
import { useEffect, useRef, useState } from 'react'

import type { CrawlerSnapshot } from '../lib/api.ts'

type Entry = CrawlerSnapshot['log'][number]

const levelColor: Record<Entry['level'], string> = {
  debug: 'text-zinc-500',
  info: 'text-sky-300',
  warn: 'text-amber-300',
  error: 'text-red-400',
}

const levelBorder: Record<Entry['level'], string> = {
  debug: 'border-l-zinc-700',
  info: 'border-l-sky-500/60',
  warn: 'border-l-amber-500/60',
  error: 'border-l-red-500/60',
}

const time = (at: number) => {
  const date = new Date(at)
  return `${date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })}.${String(date.getMilliseconds()).padStart(3, '0')}`
}

const fieldValue = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value))

const Fields = ({ fields }: { fields: Entry['fields'] }) => {
  const entries = Object.entries(fields ?? {})
  if (entries.length === 0) return null

  return (
    <span className="break-all text-zinc-500">
      {entries.map(([key, value], index) => (
        <span key={key}>
          {index > 0 ? <span className="text-zinc-700"> · </span> : null}
          <span className="text-zinc-600">{key}=</span>
          <span className="text-zinc-400">{fieldValue(value)}</span>
        </span>
      ))}
    </span>
  )
}

export const CrawlerLog = ({
  entries,
  running,
}: {
  entries: ReadonlyArray<Entry>
  running: boolean
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [entries.length])

  const copy = async () => {
    await navigator.clipboard.writeText(
      entries
        .map((entry) =>
          JSON.stringify({
            time: new Date(entry.at).toISOString(),
            level: entry.level,
            msg: entry.msg,
            ...entry.fields,
          }),
        )
        .join('\n'),
    )
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <CodePanel
      title="crawler.log"
      meta="tail -f"
      dot={running ? 'animate-pulse bg-[#4ade80]' : 'bg-zinc-600'}
      copied={copied}
      onCopy={copy}
      className="h-full min-h-[28rem]"
    >
      <div
        ref={scrollRef}
        role="log"
        aria-label="Crawler log"
        aria-live="polite"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2 font-mono text-[11px] leading-5"
      >
        {entries.length === 0 ? (
          <p className="px-4 py-4 text-zinc-500">
            waiting for crawler events<span className="animate-pulse">_</span>
          </p>
        ) : (
          entries.map((entry, index) => (
            <div
              key={`${entry.at}-${index}`}
              className={`grid grid-cols-[82px_44px_minmax(0,1fr)] gap-2 border-l-2 px-3 py-1.5 hover:bg-white/[0.025] ${levelBorder[entry.level]}`}
            >
              <span className="text-zinc-600 tabular-nums">{time(entry.at)}</span>
              <span className={`uppercase ${levelColor[entry.level]}`}>{entry.level}</span>
              <span className="min-w-0 text-zinc-300">
                <span className="break-words">{entry.msg}</span>
                {entry.fields ? (
                  <>
                    {' '}
                    <Fields fields={entry.fields} />
                  </>
                ) : null}
              </span>
            </div>
          ))
        )}
      </div>
    </CodePanel>
  )
}
