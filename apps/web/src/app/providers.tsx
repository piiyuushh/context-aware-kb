'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { shouldRetry } from '@/lib/queries'

/**
 * Client-side data layer. Created once per browser session in state so React
 * StrictMode's double render cannot build two caches.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The editor writes through the cache, so refetching on focus only
            // adds noise. Stale data is revalidated on mount instead.
            refetchOnWindowFocus: false,
            staleTime: 30_000,
            retry: shouldRetry,
          },
        },
      }),
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
