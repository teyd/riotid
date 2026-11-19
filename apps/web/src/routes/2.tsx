import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/2')({
  component: lazyRouteComponent(() => import('../pages/design-two.tsx'), 'DesignTwoPage'),
})
