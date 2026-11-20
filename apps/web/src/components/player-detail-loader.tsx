import { lazy, Suspense } from 'react'

import type { PlayerPreview } from '../lib/api.ts'
import { DetailSkeleton } from './skeleton.tsx'

const PlayerDetailPanel = lazy(() =>
  import('./player-detail.tsx').then((module) => ({ default: module.PlayerDetailPanel })),
)

type Props = {
  readonly puuid: string
  readonly preview: PlayerPreview | null
  readonly cardId: string | null
  readonly focusOnMount: boolean
  readonly focusHeading: boolean
  readonly onBack: () => void
}

const Fallback = () => <DetailSkeleton />

export const PlayerDetailLoader = ({
  puuid,
  preview,
  cardId,
  focusOnMount,
  focusHeading,
  onBack,
}: Props) => (
  <Suspense fallback={<Fallback />}>
    <PlayerDetailPanel
      puuid={puuid}
      preview={preview}
      cardId={cardId}
      focusOnMount={focusOnMount}
      focusHeading={focusHeading}
      onBack={onBack}
    />
  </Suspense>
)
