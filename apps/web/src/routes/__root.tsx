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
        <div className="flex h-16 items-center gap-8 px-5 sm:px-6">
          <Link
            to="/"
            search={{ p: undefined }}
            className="shrink-0 text-lg font-semibold tracking-tight"
          >
            riot<span className="text-accent">id</span>
          </Link>
          <nav className="flex items-center gap-1.5">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === '/' }}
                className="rounded px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-200"
                activeProps={{ className: 'text-zinc-100' }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto hidden font-mono text-[11px] text-zinc-500 sm:block">
            competitive identity history
          </span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>

      <footer className="flex h-10 shrink-0 items-center justify-between gap-4 border-t border-white/[0.06] px-5 font-mono text-[10px] text-zinc-600 sm:px-6">
        <span>unofficial fan project · not affiliated with Riot Games</span>
        <span className="hidden sm:block">data from public competitive leaderboards</span>
      </footer>
    </div>
  )
}
