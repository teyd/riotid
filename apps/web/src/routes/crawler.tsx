import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/crawler')({
  component: lazyRouteComponent(() => import('../pages/crawler-page.tsx'), 'CrawlerPage'),
})
