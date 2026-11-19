import { lazy, Suspense } from 'react'

import type { IndexRow } from '../lib/api.ts'
import { DetailSkeleton } from './skeleton.tsx'

const PlayerDetailPanel = lazy(() =>
  import('./player-detail.tsx').then((module) => ({ default: module.PlayerDetailPanel })),
)

type Props = {
  readonly puuid: string
  readonly row: IndexRow | null
  readonly cardId: string | null
  readonly onBack: () => void
}

const Fallback = () => <DetailSkeleton />

export const PlayerDetailLoader = ({ puuid, row, cardId, onBack }: Props) => (
  <Suspense fallback={<Fallback />}>
    <PlayerDetailPanel puuid={puuid} row={row} cardId={cardId} onBack={onBack} />
  </Suspense>
)
