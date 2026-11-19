import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/3')({
  component: lazyRouteComponent(() => import('../pages/design-three.tsx'), 'DesignThreePage'),
})
