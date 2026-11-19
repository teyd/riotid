import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import type { Health } from '@riotid/contracts'

export const Route = createFileRoute('/')({
  component: Home,
})

async function fetchHealth(): Promise<Health> {
  const response = await fetch('/healthz')

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`)
  }

  return response.json() as Promise<Health>
}

function Home() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
  })

  return (
    <section className="max-w-3xl">
      <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-accent">
        foundation / phase 0
      </p>
      <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
        Riot ID history, without the wait.
      </h1>
      <p className="mt-6 max-w-xl text-base leading-7 text-zinc-400">
        Track name, tag, region, and ban changes across the competitive ladder. The data pipeline
        and interface are being built in public.
      </p>

      <div className="mt-10 flex items-center gap-3 rounded-xl border border-white/10 bg-panel p-4">
        <span
          className={`size-2.5 rounded-full ${
            health.isSuccess ? 'bg-emerald-400' : health.isError ? 'bg-red-400' : 'bg-amber-400'
          }`}
        />
        <div className="text-sm">
          <p className="font-medium">
            {health.isSuccess ? 'API connected' : health.isError ? 'API offline' : 'Checking API'}
          </p>
          <p className="text-xs text-zinc-500">
            {health.isSuccess
              ? `Service ${health.data.service} is healthy`
              : health.isError
                ? 'Start the API with `mise run dev`'
                : 'Waiting for /healthz'}
          </p>
        </div>
      </div>
    </section>
  )
}
