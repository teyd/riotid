import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/1')({
  component: lazyRouteComponent(() => import('../pages/design-one.tsx'), 'DesignOnePage'),
})
