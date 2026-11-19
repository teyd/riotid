import type { ReactNode } from 'react'

export const Panel = ({
  title,
  description,
  meta,
  children,
  className = '',
}: {
  title: string
  description?: string | undefined
  meta?: string | undefined
  children: ReactNode
  className?: string | undefined
}) => (
  <section className={`rounded-lg border border-white/[0.08] p-5 ${className}`}>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">{title}</h2>
      {meta ? <span className="font-mono text-[11px] text-zinc-500">{meta}</span> : null}
    </div>
    {description ? <p className="mt-1.5 text-xs leading-5 text-zinc-500">{description}</p> : null}
    {children}
  </section>
)

export const Metric = ({ label, value }: { label: string; value: string | number }) => (
  <div className="bg-black px-4 py-4">
    <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
    <p className="mt-1.5 text-2xl font-semibold tracking-tight text-zinc-100 tabular-nums">
      {typeof value === 'number' ? value.toLocaleString() : value}
    </p>
  </div>
)

export const MetricGrid = ({
  items,
  className = 'sm:grid-cols-4 lg:grid-cols-8',
}: {
  items: ReadonlyArray<readonly [string, string | number]>
  className?: string | undefined
}) => (
  <div
    className={`grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.07] ${className}`}
  >
    {items.map(([label, value]) => (
      <Metric key={label} label={label} value={value} />
    ))}
  </div>
)

export const StatRow = ({
  label,
  value,
  muted = false,
}: {
  label: string
  value: string | number
  muted?: boolean
}) => (
  <div className="flex justify-between gap-3">
    <dt className="text-zinc-500">{label}</dt>
    <dd className={`tabular-nums ${muted ? 'text-zinc-400' : 'text-zinc-300'}`}>
      {typeof value === 'number' ? value.toLocaleString() : value}
    </dd>
  </div>
)
