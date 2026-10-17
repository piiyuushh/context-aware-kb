import type { ReactNode } from 'react'

import { AppShell } from '@/components/app-shell'
import { AuthGuard } from '@/components/auth-guard'
import { RealtimeBridge } from '@/components/realtime-bridge'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      {/* Inside the guard, so the SSE stream only opens with a session. */}
      <RealtimeBridge />
      <AppShell>{children}</AppShell>
    </AuthGuard>
  )
}
