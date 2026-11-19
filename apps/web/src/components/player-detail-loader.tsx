import { lazy, Suspense } from 'react'

import type { IndexRow } from '../lib/api.ts'

const PlayerDetailPanel = lazy(() =>
  import('./player-detail.tsx').then((module) => ({ default: module.PlayerDetailPanel })),
)

type Props = {
  readonly puuid: string
  readonly row: IndexRow | null
  readonly onBack: () => void
}

const Fallback = ({ onBack }: { onBack: () => void }) => (
  <div className="flex h-full flex-col">
    <div className="border-b border-white/[0.06] px-6 py-5">
      <button
        type="button"
        onClick={onBack}
        className="font-mono text-[11px] uppercase tracking-wide text-zinc-500 hover:text-zinc-200"
      >
        ← back
      </button>
      <p className="mt-4 font-mono text-xs uppercase tracking-wide text-zinc-500">
        Loading player history…
      </p>
    </div>
  </div>
)

export const PlayerDetailLoader = ({ puuid, row, onBack }: Props) => (
  <Suspense fallback={<Fallback onBack={onBack} />}>
    <PlayerDetailPanel puuid={puuid} row={row} onBack={onBack} />
  </Suspense>
)
