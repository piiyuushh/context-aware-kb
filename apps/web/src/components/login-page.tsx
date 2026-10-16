'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { API_PREFIX } from '@kb/shared'

import { isApiError } from '@/lib/api-client'
import { useMe } from '@/lib/queries'

/** Error codes the API can hand back through the OAuth redirect. */
const OAUTH_ERROR_COPY: Record<string, string> = {
  UNAUTHORIZED: 'GitHub rejected the sign-in attempt. Please try again.',
  FORBIDDEN: 'That sign-in attempt expired. Please start again.',
  BAD_REQUEST: 'GitHub did not return an authorization code. Please try again.',
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-current">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.65-.18 1.34-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

export function LoginPage() {
  const router = useRouter()
  const meQuery = useMe()
  const [oauthError, setOauthError] = useState<string | null>(null)

  // Read the query string off `window`: the API may redirect back with
  // `?error=CODE`, and this keeps the page free of a Suspense boundary.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error')
    if (code !== null && code.length > 0) {
      setOauthError(OAUTH_ERROR_COPY[code] ?? 'Sign in failed. Please try again.')
    }
  }, [])

  useEffect(() => {
    if (meQuery.isSuccess) router.replace('/notes')
  }, [meQuery.isSuccess, router])

  const sessionError = useMemo(() => {
    // A 401 is the expected "not signed in yet" answer, not something to show.
    if (!meQuery.isError || isApiError(meQuery.error)) return null
    return 'The API could not be reached. Check that it is running, then try again.'
  }, [meQuery.isError, meQuery.error])

  const message = oauthError ?? sessionError

  return (
    <main className="bg-canvas flex min-h-screen items-center justify-center px-4 py-12">
      <div className="bg-surface border-line w-full max-w-sm rounded-xl border p-6 sm:p-8">
        <p className="text-ink-subtle text-xs font-medium tracking-wide uppercase">
          Context-Aware Knowledge Base
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-ink-muted mt-2 text-sm text-pretty">
          Sign in with GitHub to open your notes, snippets and docs. Your knowledge base stays
          private to your account.
        </p>

        {message !== null && (
          <p
            role="alert"
            className="border-line-strong bg-surface-raised text-ink mt-5 rounded-md border px-3 py-2 text-sm"
          >
            {message}
          </p>
        )}

        {/*
          Full page navigation on purpose: the API 302s to GitHub, then back to
          this origin, so the OAuth state cookie stays same-site.
        */}
        <a
          href={`${API_PREFIX}/auth/github`}
          className="bg-accent text-accent-ink hover:bg-accent-strong focus-visible:ring-accent focus-visible:ring-offset-surface mt-6 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <GitHubMark />
          Sign in with GitHub
        </a>

        <p className="text-ink-subtle mt-4 text-xs">
          GitHub handles the credentials. This app never sees your password.
        </p>
      </div>
    </main>
  )
}
