'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'

import { useAuth } from '@/components/auth-guard'
import { CommandPalette } from '@/components/command-palette'
import { NotesSidebar } from '@/components/notes-sidebar'
import { UserAvatar } from '@/components/user-avatar'
import { useCreateNote, useLogout } from '@/lib/queries'

/** Fixed sidebar plus scrollable main pane, collapsed behind a toggle on narrow screens. */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useAuth()
  const createNote = useCreateNote()
  const logout = useLogout()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Mod-K toggles the command palette from anywhere, including the editor.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setIsPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const openPalette = () => setIsPaletteOpen(true)

  const closeSidebar = () => setIsSidebarOpen(false)

  const onCreateNote = () => {
    setCreateError(null)
    createNote.mutate(
      { type: 'note', title: 'Untitled', contentMd: '' },
      {
        onSuccess: (note) => {
          closeSidebar()
          router.push(`/notes/${note.id}`)
        },
        onError: () => setCreateError('Could not create a note.'),
      },
    )
  }

  const onSignOut = () => {
    logout.mutate(undefined, {
      onSettled: () => router.replace('/login'),
    })
  }

  return (
    <div className="flex min-h-screen flex-col lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="bg-accent text-accent-ink focus:ring-accent focus:ring-offset-canvas sr-only rounded-md px-4 py-2 text-sm font-semibold focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:ring-2 focus:ring-offset-2"
      >
        Skip to content
      </a>

      <div className="border-line bg-surface flex items-center gap-3 border-b px-4 py-3 lg:hidden">
        <button
          type="button"
          aria-expanded={isSidebarOpen}
          aria-controls="app-sidebar"
          onClick={() => setIsSidebarOpen((open) => !open)}
          className="border-line bg-surface-raised text-ink focus-visible:ring-accent rounded-md border px-3 py-1.5 text-sm focus-visible:ring-2"
        >
          {isSidebarOpen ? 'Close' : 'Notes'}
        </button>
        <span className="truncate text-sm font-semibold tracking-tight">Knowledge Base</span>
        <button
          type="button"
          onClick={openPalette}
          aria-keyshortcuts="Control+K Meta+K"
          className="border-line bg-surface-raised text-ink-muted hover:text-ink focus-visible:ring-accent ml-auto rounded-md border px-3 py-1.5 text-xs focus-visible:ring-2"
        >
          Search
        </button>
      </div>

      <aside
        id="app-sidebar"
        aria-label="Knowledge base navigation"
        className={`border-line bg-surface w-full flex-col border-b lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-hidden lg:border-r lg:border-b-0 ${
          isSidebarOpen ? 'flex' : 'hidden'
        }`}
      >
        <div className="border-line flex flex-col gap-3 border-b p-4">
          <p className="hidden font-semibold tracking-tight lg:block">Knowledge Base</p>
          <button
            type="button"
            onClick={openPalette}
            aria-keyshortcuts="Control+K Meta+K"
            className="border-line bg-surface-raised text-ink-muted hover:border-line-strong hover:text-ink focus-visible:ring-accent flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm focus-visible:ring-2"
          >
            <span>Search notes</span>
            <kbd className="text-ink-subtle text-xs">⌘K</kbd>
          </button>
          <button
            type="button"
            onClick={onCreateNote}
            disabled={createNote.isPending}
            aria-busy={createNote.isPending}
            className="bg-accent text-accent-ink hover:bg-accent-strong focus-visible:ring-accent focus-visible:ring-offset-surface w-full rounded-md px-3 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {createNote.isPending ? 'Creating…' : 'New note'}
          </button>
          {createError !== null && (
            <p role="alert" className="text-ink text-xs">
              {createError}
            </p>
          )}
          <Link
            href="/graph"
            onClick={closeSidebar}
            aria-current={pathname === '/graph' ? 'page' : undefined}
            className="border-line bg-surface-raised text-ink-muted hover:border-line-strong hover:text-ink focus-visible:ring-accent flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm focus-visible:ring-2"
          >
            Knowledge graph
          </Link>
        </div>

        <NotesSidebar onNavigate={closeSidebar} />

        <div className="border-line mt-auto flex items-center gap-3 border-t p-4">
          <UserAvatar user={user} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{user.username}</span>
            <span className="text-ink-subtle truncate text-xs">
              {user.email ?? 'Signed in with GitHub'}
            </span>
          </span>
          <button
            type="button"
            onClick={onSignOut}
            disabled={logout.isPending}
            aria-busy={logout.isPending}
            className="border-line-strong bg-surface-raised text-ink focus-visible:ring-accent rounded-md border px-2.5 py-1.5 text-xs focus-visible:ring-2 disabled:opacity-60"
          >
            {logout.isPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>

      <main id="main-content" className="min-w-0 flex-1">
        {children}
      </main>

      <CommandPalette open={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} />
    </div>
  )
}
