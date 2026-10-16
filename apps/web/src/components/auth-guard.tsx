'use client'

import { useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import type { User } from '@kb/shared'

import { isApiError } from '@/lib/api-client'
import { useMe } from '@/lib/queries'

type AuthContextValue = {
  user: User
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** The signed-in user. Only valid inside `<AuthGuard>`. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error('useAuth must be used inside <AuthGuard>')
  }
  return context
}

function SessionSpinner() {
  return (
    <div
      className="bg-canvas flex min-h-screen items-center justify-center gap-3"
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className="border-line-strong border-t-accent size-5 animate-spin rounded-full border-2"
      />
      <span className="text-ink-muted text-sm">Checking your session…</span>
    </div>
  )
}

function RedirectNotice() {
  return (
    <div className="bg-canvas flex min-h-screen items-center justify-center" role="status">
      <p className="text-ink-muted text-sm">Taking you to sign in…</p>
    </div>
  )
}

function SessionError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="bg-canvas flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center"
      role="alert"
    >
      <h1 className="text-xl font-semibold tracking-tight">Could not check your session</h1>
      <p className="text-ink-muted max-w-md text-sm text-pretty">
        The API did not answer. Check that it is running, then try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="border-line-strong bg-surface-raised text-ink focus-visible:ring-accent rounded-md border px-3 py-1.5 text-sm focus-visible:ring-2"
      >
        Try again
      </button>
    </div>
  )
}

/**
 * Client-side gate for authenticated pages. The API speaks cookie auth through
 * a same-origin rewrite, so the browser is the only place that can check the
 * session — server components cannot.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter()
  const meQuery = useMe()

  // Only a real 401 means "signed out"; a network or server failure must not
  // bounce the user to the login page.
  const unauthenticated =
    meQuery.isError && isApiError(meQuery.error) && meQuery.error.status === 401

  useEffect(() => {
    if (unauthenticated) router.replace('/login')
  }, [unauthenticated, router])

  const value = useMemo<AuthContextValue | null>(
    () => (meQuery.data ? { user: meQuery.data } : null),
    [meQuery.data],
  )

  if (meQuery.isPending) return <SessionSpinner />
  if (unauthenticated) return <RedirectNotice />
  if (value === null) return <SessionError onRetry={() => void meQuery.refetch()} />

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
