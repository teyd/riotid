import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

import { PlayerDetailLoader } from '../components/player-detail-loader.tsx'
import { fetchIndex, P } from '../lib/api.ts'

export const Route = createFileRoute('/puuid/$puuid')({
  component: PlayerPage,
})

function PlayerPage() {
  const { puuid } = Route.useParams()
  const navigate = useNavigate()
  const index = useQuery({
    queryKey: ['index'],
    queryFn: fetchIndex,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (index.isError) {
      void navigate({ to: '/', search: { p: undefined }, replace: true })
    }
  }, [index.isError, navigate])

  const row = index.data?.players.find((item) => item[P.puuid] === puuid) ?? null

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col border-x border-white/[0.06]">
      <PlayerDetailLoader
        puuid={puuid}
        row={row}
        onBack={() => void navigate({ to: '/', search: { p: undefined } })}
      />
    </div>
  )
}
