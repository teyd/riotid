import { createFileRoute } from '@tanstack/react-router'

import { PlayersPage } from '../pages/players-page.tsx'

export const Route = createFileRoute('/puuid/$puuid')({
  component: PlayerRoute,
})

function PlayerRoute() {
  const { puuid } = Route.useParams()
  return <PlayersPage selected={puuid} />
}
