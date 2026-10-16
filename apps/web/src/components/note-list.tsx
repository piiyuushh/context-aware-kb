'use client'

import Link from 'next/link'
import type { Note } from '@kb/shared'

import { NoteTypeBadge } from '@/components/note-type-badge'
import { formatNoteDate } from '@/lib/format'

type NoteListProps = {
  notes: Note[]
  activeNoteId: string | null
  /** Lets the shell close the sidebar on narrow screens. */
  onNavigate?: () => void
}

export function NoteList({ notes, activeNoteId, onNavigate }: NoteListProps) {
  if (notes.length === 0) {
    return <p className="text-ink-subtle px-3 py-4 text-sm">No notes match this view.</p>
  }

  return (
    <ul className="flex flex-col gap-1">
      {notes.map((note) => {
        const isActive = note.id === activeNoteId
        return (
          <li key={note.id}>
            <Link
              href={`/notes/${note.id}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={onNavigate}
              className={`focus-visible:ring-accent flex flex-col gap-1 rounded-md border px-3 py-2 focus-visible:ring-2 ${
                isActive
                  ? 'border-line-strong bg-surface-raised'
                  : 'hover:bg-surface-raised border-transparent'
              }`}
            >
              <span className="truncate text-sm font-medium">{note.title}</span>
              <span className="flex items-center gap-2">
                <NoteTypeBadge type={note.type} />
                <time dateTime={note.updatedAt} className="text-ink-subtle text-xs">
                  {formatNoteDate(note.updatedAt)}
                </time>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
