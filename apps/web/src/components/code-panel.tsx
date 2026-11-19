import { Toolbar, ToolbarButton } from '@ui-sdk/react/toolbar'
import type { ReactNode } from 'react'

export const CodePanel = ({
  title,
  dot,
  meta,
  copied,
  onCopy,
  children,
  footer,
  className = '',
}: {
  title: string
  dot: string
  meta?: string | undefined
  copied: boolean
  onCopy: () => void
  children: ReactNode
  footer?: ReactNode
  className?: string | undefined
}) => (
  <section
    className={`flex flex-col overflow-hidden rounded-lg border border-white/[0.08] bg-[#050505] ${className}`}
  >
    <header className="flex shrink-0 items-center gap-2 border-b border-white/[0.08] px-4 py-2.5">
      <span className={`size-1.5 rounded-full ${dot}`} />
      <span className="font-mono text-[11px] text-zinc-300">{title}</span>
      {meta ? <span className="font-mono text-[10px] text-zinc-600">{meta}</span> : null}
      <Toolbar aria-label={`${title} actions`} className="ml-auto">
        <ToolbarButton
          onClick={onCopy}
          className="font-mono text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-200"
        >
          {copied ? 'copied' : 'copy'}
        </ToolbarButton>
      </Toolbar>
    </header>
    {children}
    {footer}
  </section>
)
