import type { ReactNode } from 'react'

export const Badge = ({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'warn' | 'info'
}) => {
  const tones = {
    neutral: 'border-white/10 bg-white/[0.04] text-zinc-400',
    accent: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    warn: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    info: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  }

  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-1 font-mono text-[11px] uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export const Dot = ({ tone }: { tone: 'accent' | 'warn' | 'info' | 'muted' }) => {
  const tones = {
    accent: 'bg-emerald-400',
    warn: 'bg-amber-400',
    info: 'bg-sky-400',
    muted: 'bg-zinc-600',
  }

  return <span className={`size-1.5 shrink-0 rounded-full ${tones[tone]}`} />
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
      <h3 className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">{title}</h3>
      {meta}
    </div>
    {children}
  </section>
)

export const EmptyState = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
    <p className="text-base text-zinc-300">{title}</p>
    {hint ? <p className="max-w-sm text-sm leading-6 text-zinc-500">{hint}</p> : null}
  </div>
)

export const LoadingState = ({ label = 'Loading' }: { label?: string }) => (
  <div className="flex items-center gap-3 px-6 py-6 font-mono text-xs uppercase tracking-wide text-zinc-500">
    <span className="size-1.5 animate-pulse rounded-full bg-accent" />
    {label}
  </div>
)

export const ErrorState = ({ error }: { error: Error }) => (
  <div className="flex flex-col items-start gap-2 p-6">
    <p className="text-base text-amber-300">Could not load data.</p>
    <p className="font-mono text-xs text-zinc-500">{error.message}</p>
  </div>
)
