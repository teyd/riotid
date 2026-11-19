import { createFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/players/$puuid')({
  component: LegacyPlayerPage,
})

function LegacyPlayerPage() {
  const { puuid } = Route.useParams()
  return <Navigate to="/puuid/$puuid" params={{ puuid }} replace />
}
