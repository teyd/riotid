import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/status')({
  component: lazyRouteComponent(() => import('../pages/status-page.tsx'), 'StatusPage'),
})
