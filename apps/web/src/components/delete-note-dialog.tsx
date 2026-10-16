'use client'

import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { usePathname, useRouter } from 'next/navigation'
import type { Note } from '@kb/shared'

import { isApiError } from '@/lib/api-client'
import { useDeleteNote } from '@/lib/queries'

type DeleteNoteDialogProps = {
  /** The note awaiting confirmation, or null when the dialog is closed. */
  note: Note | null
  onClose: () => void
  /** Lets the shell close the sidebar after deleting the open note. */
  onNavigate?: () => void
}

/**
 * Confirms a destructive delete before calling `DELETE /notes/:id`. On success
 * the mutation clears the note from the query cache; if that note was open, we
 * return to the notes home instead of leaving a stale editor on screen.
 */
export function DeleteNoteDialog(props: DeleteNoteDialogProps) {
  // Mounted only while a note is pending, so each open starts from a clean
  // mutation state (no error left over from a previous attempt).
  if (props.note === null) return null
  return <DeleteNoteDialogContent {...props} note={props.note} />
}

function DeleteNoteDialogContent({
  note,
  onClose,
  onNavigate,
}: DeleteNoteDialogProps & { note: Note }) {
  const router = useRouter()
  const pathname = usePathname()
  const deleteNote = useDeleteNote()

  const confirmDelete = () => {
    deleteNote.mutate(note.id, {
      onSuccess: () => {
        // Read the route at confirm time: the open note may have changed while
        // the dialog was up.
        if (pathname === `/notes/${note.id}`) {
          router.push('/notes')
          onNavigate?.()
        }
        onClose()
      },
    })
  }

  const errorMessage = deleteNote.isError
    ? isApiError(deleteNote.error) && deleteNote.error.status === 404
      ? 'This note was already deleted.'
      : 'Could not delete this note. Please try again.'
    : null

  return (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        // Stay put while the request is in flight; otherwise Escape or Cancel
        // dismisses the dialog.
        if (!open && !deleteNote.isPending) onClose()
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <AlertDialog.Content className="border-line bg-surface focus-visible:ring-accent fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border p-5 shadow-2xl focus-visible:ring-2">
          <AlertDialog.Title className="text-ink text-lg font-semibold tracking-tight">
            Delete note?
          </AlertDialog.Title>
          <AlertDialog.Description className="text-ink-muted mt-2 text-sm text-pretty">
            &ldquo;{note.title}&rdquo; will be permanently deleted. This cannot be undone.
          </AlertDialog.Description>

          {errorMessage !== null && (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {errorMessage}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel
              disabled={deleteNote.isPending}
              className="border-line-strong bg-surface-raised text-ink hover:bg-surface focus-visible:ring-accent rounded-md border px-3 py-1.5 text-sm focus-visible:ring-2 disabled:opacity-60"
            >
              Cancel
            </AlertDialog.Cancel>
            <AlertDialog.Action
              disabled={deleteNote.isPending}
              aria-busy={deleteNote.isPending}
              onClick={(event) => {
                // The action would normally close the dialog; keep it open so a
                // pending state or a failed request stays visible.
                event.preventDefault()
                confirmDelete()
              }}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-60"
            >
              {deleteNote.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
