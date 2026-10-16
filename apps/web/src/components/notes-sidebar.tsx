'use client'

import { usePathname } from 'next/navigation'
import { useMemo, useState } from 'react'

import { NoteList } from '@/components/note-list'
import { TagList } from '@/components/tag-list'
import type { NoteFilters } from '@/lib/api-client'
import { useNotes, useTags } from '@/lib/queries'
import { useDebouncedValue } from '@/lib/use-debounced-value'

const NOTE_PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 300

function activeNoteIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith('/notes/')) return null
  const id = pathname.slice('/notes/'.length)
  return id.length > 0 ? id : null
}

/** Search, note list and tag filter. Owns the list filters for the shell. */
export function NotesSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)

  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS)
  const filters = useMemo<NoteFilters>(() => {
    const query = debouncedSearch.trim()
    return {
      limit: NOTE_PAGE_SIZE,
      q: query.length > 0 ? query : undefined,
      tag: activeTag ?? undefined,
    }
  }, [debouncedSearch, activeTag])

  const notesQuery = useNotes(filters)
  const tagsQuery = useTags()

  const activeNoteId = activeNoteIdFromPath(pathname)
  const notes = notesQuery.data?.notes ?? []
  const hasMore = notesQuery.data?.nextCursor != null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="note-search" className="text-ink-muted text-xs font-medium">
          Search notes
        </label>
        <input
          id="note-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Title or content…"
          autoComplete="off"
          className="border-line bg-surface-raised text-ink placeholder:text-ink-subtle focus-visible:ring-accent w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2"
        />
      </div>

      <section aria-labelledby="sidebar-notes-heading" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="sidebar-notes-heading" className="text-ink-muted text-xs font-medium uppercase">
            Notes
          </h2>
          {notesQuery.isFetching && (
            <span className="text-ink-subtle text-xs" role="status">
              Updating…
            </span>
          )}
        </div>

        {notesQuery.isPending ? (
          <p className="text-ink-subtle px-3 py-2 text-sm" role="status">
            Loading notes…
          </p>
        ) : notesQuery.isError ? (
          <div className="flex flex-col gap-2 px-3 py-2" role="alert">
            <p className="text-ink text-sm">Could not load your notes.</p>
            <button
              type="button"
              onClick={() => void notesQuery.refetch()}
              className="border-line-strong bg-surface-raised text-ink focus-visible:ring-accent self-start rounded-md border px-2.5 py-1 text-xs focus-visible:ring-2"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <NoteList notes={notes} activeNoteId={activeNoteId} onNavigate={onNavigate} />
            {hasMore && (
              <p className="text-ink-subtle px-3 text-xs">
                Showing the {notes.length} most recent notes. Narrow the search to reach older ones.
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="sidebar-tags-heading" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="sidebar-tags-heading" className="text-ink-muted text-xs font-medium uppercase">
            Tags
          </h2>
          {activeTag !== null && (
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className="text-ink-muted hover:text-ink focus-visible:ring-accent rounded text-xs underline underline-offset-2 focus-visible:ring-2"
            >
              Clear filter
            </button>
          )}
        </div>

        {tagsQuery.isPending ? (
          <p className="text-ink-subtle text-sm" role="status">
            Loading tags…
          </p>
        ) : tagsQuery.isError ? (
          <p className="text-ink-subtle text-sm" role="alert">
            Could not load tags.
          </p>
        ) : (
          <TagList
            tags={tagsQuery.data}
            activeTag={activeTag}
            onToggle={(name) => setActiveTag((current) => (current === name ? null : name))}
          />
        )}
      </section>
    </div>
  )
}
