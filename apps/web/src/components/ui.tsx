import type { ReactNode } from 'react'

export const Badge = ({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'warn' | 'info'
}) => {
  const tones = {
    neutral: 'text-zinc-400',
    accent: 'text-zinc-100',
    warn: 'text-zinc-200',
    info: 'text-zinc-300',
  }

  return (
    <span className={`font-mono text-[11px] uppercase tracking-[0.18em] ${tones[tone]}`}>
      {children}
    </span>
  )
}

export const Section = ({
  title,
  meta,
  children,
}: {
  title: string
  meta?: ReactNode
  children: ReactNode
}) => (
  <section className="border-t border-white/[0.06] px-6 py-6">
    <div className="mb-4 flex items-center justify-between">
      <h3 className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">{title}</h3>
      {meta}
    </div>
    {children}
  </section>
)

export const EmptyState = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
    <h2 className="text-base text-zinc-200 text-balance">{title}</h2>
    {hint ? <p className="max-w-sm text-sm leading-6 text-zinc-400">{hint}</p> : null}
  </div>
)

export const LoadingState = ({ label = 'Loading' }: { label?: string }) => (
  <div
    role="status"
    className="flex items-center gap-3 px-6 py-6 font-mono text-xs uppercase tracking-wide text-zinc-400"
  >
    <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-accent" />
    {label}
  </div>
)
