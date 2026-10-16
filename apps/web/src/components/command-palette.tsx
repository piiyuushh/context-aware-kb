'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { DEFAULT_SEARCH_LIMIT, type NoteType } from '@kb/shared'

import { NoteTypeBadge } from '@/components/note-type-badge'
import type { SearchFilters } from '@/lib/api-client'
import { formatNoteDate } from '@/lib/format'
import { useSearchNotes, useTags } from '@/lib/queries'
import { parseSearchSnippet } from '@/lib/search-snippet'
import { useDebouncedValue } from '@/lib/use-debounced-value'

/** Quiet period before a keystroke reaches the API. */
const SEARCH_DEBOUNCE_MS = 250

type TypeFilter = NoteType | 'all'

const TYPE_FILTERS: readonly TypeFilter[] = ['all', 'doc', 'snippet', 'note']

function typeFilterClass(isActive: boolean): string {
  return `focus-visible:ring-accent rounded-full border px-2.5 py-1 text-xs focus-visible:ring-2 ${
    isActive
      ? 'border-accent bg-accent/15 text-accent font-semibold'
      : 'border-line bg-surface-raised text-ink-muted hover:text-ink'
  }`
}

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
}

/**
 * Cmd/Ctrl-K command palette. `open` is controlled by the shell; the dialog
 * only exists while it is open, so every session starts from a blank query,
 * fresh filters and the first result selected.
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  if (!open) return null
  return <CommandPaletteDialog onClose={onClose} />
}

function CommandPaletteDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const optionRefs = useRef<(HTMLLIElement | null)[]>([])

  const [query, setQuery] = useState('')
  const [activeType, setActiveType] = useState<TypeFilter>('all')
  const [activeTag, setActiveTag] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const filters = useMemo<SearchFilters>(
    () => ({
      q: debouncedQuery.trim(),
      type: activeType === 'all' ? undefined : activeType,
      tag: activeTag.length > 0 ? activeTag : undefined,
      limit: DEFAULT_SEARCH_LIMIT,
    }),
    [debouncedQuery, activeType, activeTag],
  )

  const searchQuery = useSearchNotes(filters)
  const tagsQuery = useTags()

  const results = searchQuery.data ?? []
  const hasQuery = query.trim().length > 0
  const hasResults = results.length > 0
  const activeResult = results[activeIndex]
  const activeOptionId =
    activeResult !== undefined ? `palette-option-${activeResult.note.id}` : undefined

  // The palette is mounted on open, so this is the open-focus.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // A new term or filter is a new result set: start from the best hit.
  useEffect(() => {
    setActiveIndex(0)
  }, [debouncedQuery, activeType, activeTag])

  // Results can shrink under the selection; clamp instead of wrapping here.
  useEffect(() => {
    setActiveIndex((index) => (results.length === 0 ? 0 : Math.min(index, results.length - 1)))
  }, [results.length])

  // Follow the selection when it is moved with the keyboard.
  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, results.length])

  const openNote = (id: string) => {
    router.push(`/notes/${id}`)
    onClose()
  }

  const moveActive = (step: number) => {
    if (results.length === 0) return
    setActiveIndex((index) => (index + step + results.length) % results.length)
  }

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveActive(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(-1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      if (results.length > 0) setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      if (results.length > 0) setActiveIndex(results.length - 1)
    } else if (event.key === 'Enter') {
      if (activeResult === undefined) return
      event.preventDefault()
      openNote(activeResult.note.id)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  // Escape reaches here when focus sits on a filter, not on the input. Tab is
  // trapped so the modal cannot hand focus back to the page behind it.
  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return

    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key !== 'Tab') return
    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        'input, select, button, a[href], [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (first === undefined || last === undefined) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-16 sm:pt-24"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search notes"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onDialogKeyDown}
        className="border-line bg-surface flex w-full max-w-xl flex-col rounded-lg border shadow-2xl"
      >
        <div className="border-line flex flex-col gap-3 border-b p-4">
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label="Search notes"
            aria-expanded={hasResults}
            aria-controls={hasResults ? 'palette-results' : undefined}
            aria-activedescendant={activeOptionId}
            autoComplete="off"
            placeholder="Search notes…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            className="border-line bg-surface-raised text-ink placeholder:text-ink-subtle focus-visible:ring-accent w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2"
          />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div
              role="group"
              aria-label="Filter by note type"
              className="flex flex-wrap items-center gap-1.5"
            >
              {TYPE_FILTERS.map((value) => {
                const isActive = value === activeType
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setActiveType(value)}
                    className={typeFilterClass(isActive)}
                  >
                    {value === 'all' ? 'All' : <NoteTypeBadge type={value} />}
                  </button>
                )
              })}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <label htmlFor="palette-tag-filter" className="text-ink-subtle text-xs">
                Tag
              </label>
              <select
                id="palette-tag-filter"
                value={activeTag}
                onChange={(event) => setActiveTag(event.target.value)}
                className="border-line bg-surface-raised text-ink focus-visible:ring-accent rounded-md border px-2 py-1 text-xs focus-visible:ring-2"
              >
                <option value="">All tags</option>
                {(tagsQuery.data ?? []).map((tag) => (
                  <option key={tag.id} value={tag.name}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="min-h-32 flex-1">
          {!hasQuery ? (
            <p className="text-ink-subtle p-4 text-sm">Type to search your notes.</p>
          ) : searchQuery.isError ? (
            <div role="alert" className="flex flex-col items-start gap-2 p-4">
              <p className="text-ink text-sm">Could not search your notes.</p>
              <p className="text-ink-subtle text-xs">
                Check that the API is running, then try again.
              </p>
              <button
                type="button"
                onClick={() => void searchQuery.refetch()}
                className="border-line-strong bg-surface-raised text-ink focus-visible:ring-accent rounded-md border px-2.5 py-1 text-xs focus-visible:ring-2"
              >
                Try again
              </button>
            </div>
          ) : searchQuery.isPending ? (
            <p role="status" className="text-ink-subtle p-4 text-sm">
              Searching…
            </p>
          ) : !hasResults ? (
            <p className="text-ink-subtle p-4 text-sm">
              No notes match &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            <ul
              id="palette-results"
              role="listbox"
              aria-label="Search results"
              className="max-h-80 overflow-y-auto py-1"
            >
              {results.map((result, index) => {
                const isActive = index === activeIndex
                return (
                  <li
                    key={result.note.id}
                    id={`palette-option-${result.note.id}`}
                    role="option"
                    aria-selected={isActive}
                    ref={(element) => {
                      optionRefs.current[index] = element
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => openNote(result.note.id)}
                    className={`flex cursor-pointer flex-col gap-1 px-4 py-2.5 ${
                      isActive ? 'bg-surface-raised' : ''
                    }`}
                  >
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-ink min-w-0 truncate text-sm font-medium">
                        {result.note.title}
                      </span>
                      <NoteTypeBadge type={result.note.type} />
                      <time dateTime={result.note.updatedAt} className="text-ink-subtle text-xs">
                        {formatNoteDate(result.note.updatedAt)}
                      </time>
                    </span>

                    {result.note.tags.length > 0 && (
                      <span className="text-ink-subtle flex flex-wrap gap-1.5 text-xs">
                        {result.note.tags.map((tag) => (
                          <span key={tag.id}>#{tag.name}</span>
                        ))}
                      </span>
                    )}

                    <span className="text-ink-muted line-clamp-2 text-xs">
                      {parseSearchSnippet(result.snippet).map((segment, segmentIndex) =>
                        segment.highlighted ? (
                          <mark key={segmentIndex} className="bg-accent/30 text-ink rounded-sm">
                            {segment.text}
                          </mark>
                        ) : (
                          <span key={segmentIndex}>{segment.text}</span>
                        ),
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="border-line text-ink-subtle flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs">
          <span aria-hidden="true">↑↓ to move · ↵ to open · Esc to close</span>
          <span className="ml-auto">⌘K / Ctrl+K</span>
        </div>
      </div>
    </div>
  )
}
