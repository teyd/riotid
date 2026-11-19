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
  readonly focusOnMount: boolean
  readonly focusHeading: boolean
  readonly onBack: () => void
}

const Fallback = () => <DetailSkeleton />

export const PlayerDetailLoader = ({
  puuid,
  row,
  cardId,
  focusOnMount,
  focusHeading,
  onBack,
}: Props) => (
  <Suspense fallback={<Fallback />}>
    <PlayerDetailPanel
      puuid={puuid}
      row={row}
      cardId={cardId}
      focusOnMount={focusOnMount}
      focusHeading={focusHeading}
      onBack={onBack}
    />
  </Suspense>
)
