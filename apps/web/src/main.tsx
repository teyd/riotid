import '@fontsource-variable/space-grotesk'
import './styles.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { trackPageview } from './lib/analytics.ts'
import { isRateLimited } from './lib/api.ts'
import { router } from './router.tsx'

router.subscribe('onResolved', trackPageview)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => failureCount < 1 && !isRateLimited(error),
    },
  },
})

const root = document.getElementById('root')

if (!root) {
  throw new Error('Missing #root element')
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
