import { createFileRoute } from '@tanstack/react-router'

import { PlayersPage } from '../pages/players-page.tsx'

export const Route = createFileRoute('/')({
  component: PlayersIndex,
})

function PlayersIndex() {
  return <PlayersPage />
}
