import type { CSSProperties } from 'react'

export const CardArt = ({
  art,
  name,
  className,
  width,
  height,
  fallback,
  loading = 'lazy',
  fetchPriority = 'auto',
  style,
}: {
  art: string | null
  name: string
  className: string
  width: number
  height: number
  fallback?: string
  loading?: 'eager' | 'lazy'
  fetchPriority?: 'high' | 'low' | 'auto'
  style?: CSSProperties
}) => (
  <span className={`relative overflow-hidden ${className}`} style={style}>
    <span aria-hidden>{fallback ?? (name || '?').slice(0, 1).toUpperCase()}</span>
    {art ? (
      <img
        src={art}
        alt=""
        width={width}
        height={height}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        className="absolute inset-0 h-full w-full object-cover"
        onError={(event) => {
          event.currentTarget.style.display = 'none'
        }}
      />
    ) : null}
  </span>
)
