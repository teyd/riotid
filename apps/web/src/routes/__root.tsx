import { createRootRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: Root,
})

function Root() {
  return (
    <div className="min-h-dvh bg-ink text-zinc-100">
      <header className="border-b border-white/10">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-5">
          <Link to="/" className="font-semibold tracking-tight">
            riot<span className="text-accent">id</span>
          </Link>
          <span className="text-xs text-zinc-500">competitive identity history</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-10">
        <Outlet />
      </main>
    </div>
  )
}
