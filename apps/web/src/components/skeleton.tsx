export const Skeleton = ({ className = '' }: { className?: string }) => (
  <span
    aria-hidden="true"
    className={`block rounded bg-white/[0.06] ${className} motion-safe:animate-pulse`}
  />
)

export const PlayerListSkeleton = () => (
  <div className="space-y-0" aria-label="Loading players" role="status">
    {Array.from({ length: 9 }, (_, index) => (
      <div key={index} className="flex h-14 items-center gap-3 border-b border-white/[0.05] px-3">
        <Skeleton className="h-10 w-8 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-2.5 w-24" />
        </div>
        <Skeleton className="h-2.5 w-12" />
      </div>
    ))}
  </div>
)

export const DetailSkeleton = () => (
  <div className="flex h-full flex-col" role="status" aria-label="Loading player history">
    <div className="border-b border-white/[0.06] px-6 py-5">
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-11" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-6">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-28" />
      </div>
    </div>
    <div className="space-y-4 px-6 py-6">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="space-y-2 border-b border-white/[0.05] pb-4">
          <Skeleton className="h-3.5 w-56" />
          <Skeleton className="h-2.5 w-40" />
        </div>
      ))}
    </div>
  </div>
)
