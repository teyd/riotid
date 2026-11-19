import { createRootRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: Root,
})

const nav = [{ to: '/', label: 'players' }] as const

function Root() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink text-zinc-100">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-panel focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-ink/95 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 sm:gap-8 sm:px-6">
          <Link to="/" className="shrink-0 text-lg font-semibold tracking-tight">
            riot<span className="text-accent">id</span>
          </Link>
          <nav className="flex items-center gap-0.5 sm:gap-1.5">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === '/' }}
                className="rounded px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500 hover:text-zinc-200 sm:px-2.5 sm:text-[12px] sm:tracking-[0.14em]"
                activeProps={{ className: 'text-zinc-100' }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto hidden font-mono text-[12px] text-zinc-500 sm:block">
            competitive identity history
          </span>
        </div>
      </header>

      <main id="main" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
