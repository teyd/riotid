import { createRootRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: Root,
})

const nav = [
  { to: '/', label: 'players' },
  { to: '/stats', label: 'stats' },
  { to: '/status', label: 'status' },
] as const

function Root() {
  return (
    <div className="flex min-h-dvh flex-col bg-ink text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-ink/95 backdrop-blur">
        <div className="flex h-14 items-center gap-6 px-4 sm:px-5">
          <Link to="/" search={{ p: undefined }} className="shrink-0 font-semibold tracking-tight">
            riot<span className="text-accent">id</span>
          </Link>
          <nav className="flex items-center gap-1">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === '/' }}
                className="rounded px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-200"
                activeProps={{ className: 'text-zinc-100' }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto hidden font-mono text-[10px] text-zinc-600 sm:block">
            competitive identity history
          </span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>

      <footer className="flex h-8 shrink-0 items-center justify-between gap-4 border-t border-white/[0.06] px-4 font-mono text-[9px] text-zinc-600 sm:px-5">
        <span>unofficial fan project · not affiliated with Riot Games</span>
        <span className="hidden sm:block">data from public competitive leaderboards</span>
      </footer>
    </div>
  )
}
