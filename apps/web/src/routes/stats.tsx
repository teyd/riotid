import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/stats')({
  component: lazyRouteComponent(() => import('../pages/stats-page.tsx'), 'StatsPage'),
})
