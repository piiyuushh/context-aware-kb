'use client'

import { useState } from 'react'
import type { Note } from '@kb/shared'

import { DeleteNoteDialog } from '@/components/delete-note-dialog'
import { NoteContextMenu } from '@/components/note-context-menu'

type NoteListProps = {
  notes: Note[]
  activeNoteId: string | null
  /** Lets the shell close the sidebar on narrow screens. */
  onNavigate?: () => void
}

/**
 * The sidebar note rows. Each row owns a context menu (right-click, long press
 * or the context-menu key) and the Delete key; both route through the single
 * confirmation dialog below.
 */
export function NoteList({ notes, activeNoteId, onNavigate }: NoteListProps) {
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null)

  if (notes.length === 0) {
    return <p className="text-ink-subtle px-3 py-4 text-sm">No notes match this view.</p>
  }

  return (
    <>
      <ul className="flex flex-col gap-1">
        {notes.map((note) => (
          <li key={note.id}>
            <NoteContextMenu
              note={note}
              isActive={note.id === activeNoteId}
              onNavigate={onNavigate}
              onRequestDelete={(target) => setPendingDelete(target)}
            />
          </li>
        ))}
      </ul>
      <DeleteNoteDialog
        note={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onNavigate={onNavigate}
      />
    </>
  )
}
