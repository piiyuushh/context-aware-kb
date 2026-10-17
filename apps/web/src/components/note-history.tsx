'use client'

import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { useState } from 'react'
import type { NoteVersion } from '@kb/shared'

import { isApiError } from '@/lib/api-client'
import { formatNoteDateTime } from '@/lib/format'
import { useNoteVersions, useRestoreNoteVersion } from '@/lib/queries'

type NoteHistoryProps = {
  noteId: string
  /** Lets the editor remount its pane so the restored revision is shown. */
  onRestored: () => void
}

/**
 * The note's revision history, newest first. A version is the state a note was
 * edited *away* from, so restoring one rolls the body back to that snapshot.
 */
export function NoteHistory({ noteId, onRestored }: NoteHistoryProps) {
  const versionsQuery = useNoteVersions(noteId)
  const [pendingVersion, setPendingVersion] = useState<NoteVersion | null>(null)

  const versions = versionsQuery.data ?? []

  return (
    <section
      id="note-history"
      aria-labelledby="note-history-heading"
      className="border-line border-b px-4 py-4 sm:px-6"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="note-history-heading" className="text-ink-muted text-xs font-medium uppercase">
          History
        </h2>
        {versionsQuery.isFetching && (
          <span role="status" className="text-ink-subtle text-xs">
            Updating…
          </span>
        )}
      </div>

      {versionsQuery.isPending ? (
        <p role="status" className="text-ink-subtle mt-2 text-sm">
          Loading revisions…
        </p>
      ) : versionsQuery.isError ? (
        <div role="alert" className="mt-2 flex flex-col items-start gap-2">
          <p className="text-ink text-sm">Could not load this note&rsquo;s history.</p>
          <button
            type="button"
            onClick={() => void versionsQuery.refetch()}
            className="border-line-strong bg-surface-raised text-ink focus-visible:ring-accent rounded-md border px-2.5 py-1 text-xs focus-visible:ring-2"
          >
            Try again
          </button>
        </div>
      ) : versions.length === 0 ? (
        <p className="text-ink-subtle mt-2 text-sm">
          No earlier revisions yet. They appear here once this note is edited.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {versions.map((version) => (
            <li
              key={version.id}
              className="border-line flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2 last:border-b-0"
            >
              <time dateTime={version.createdAt} className="text-ink-muted text-xs tabular-nums">
                {formatNoteDateTime(version.createdAt)}
              </time>
              <span className="text-ink min-w-0 flex-1 truncate text-sm">
                {version.title.trim().length > 0 ? version.title : 'Untitled'}
              </span>
              <button
                type="button"
                aria-label={`Restore the version from ${formatNoteDateTime(version.createdAt)}`}
                onClick={() => setPendingVersion(version)}
                className="border-line-strong bg-surface-raised text-ink hover:bg-surface focus-visible:ring-accent rounded-md border px-2.5 py-1 text-xs focus-visible:ring-2"
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Mounted only while a version is pending, so each open starts clean. */}
      <RestoreVersionDialog
        noteId={noteId}
        version={pendingVersion}
        onClose={() => setPendingVersion(null)}
        onRestored={onRestored}
      />
    </section>
  )
}

type RestoreVersionDialogProps = {
  noteId: string
  /** The revision awaiting confirmation, or null when the dialog is closed. */
  version: NoteVersion | null
  onClose: () => void
  onRestored: () => void
}

function RestoreVersionDialog(props: RestoreVersionDialogProps) {
  if (props.version === null) return null
  return <RestoreVersionDialogContent {...props} version={props.version} />
}

function RestoreVersionDialogContent({
  noteId,
  version,
  onClose,
  onRestored,
}: RestoreVersionDialogProps & { version: NoteVersion }) {
  const restore = useRestoreNoteVersion()

  const confirmRestore = () => {
    restore.mutate(
      { id: noteId, versionId: version.id },
      {
        onSuccess: () => {
          onRestored()
          onClose()
        },
      },
    )
  }

  const errorMessage = restore.isError
    ? isApiError(restore.error) && restore.error.status === 404
      ? 'That revision no longer exists.'
      : 'Could not restore this revision. Please try again.'
    : null

  return (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        // Stay put while the request is in flight; otherwise Escape or Cancel
        // dismisses the dialog.
        if (!open && !restore.isPending) onClose()
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <AlertDialog.Content className="border-line bg-surface focus-visible:ring-accent fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border p-5 shadow-2xl focus-visible:ring-2">
          <AlertDialog.Title className="text-ink text-lg font-semibold tracking-tight">
            Restore this revision?
          </AlertDialog.Title>
          <AlertDialog.Description className="text-ink-muted mt-2 text-sm text-pretty">
            The current title and content are replaced by &ldquo;
            {version.title.trim().length > 0 ? version.title : 'Untitled'}&rdquo; from{' '}
            {formatNoteDateTime(version.createdAt)}.
          </AlertDialog.Description>

          {errorMessage !== null && (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {errorMessage}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel
              disabled={restore.isPending}
              className="border-line-strong bg-surface-raised text-ink hover:bg-surface focus-visible:ring-accent rounded-md border px-3 py-1.5 text-sm focus-visible:ring-2 disabled:opacity-60"
            >
              Cancel
            </AlertDialog.Cancel>
            <AlertDialog.Action
              disabled={restore.isPending}
              aria-busy={restore.isPending}
              onClick={(event) => {
                // The action would normally close the dialog; keep it open so a
                // pending state or a failed request stays visible.
                event.preventDefault()
                confirmRestore()
              }}
              className="bg-accent text-accent-ink hover:bg-accent-strong focus-visible:ring-accent rounded-md px-3 py-1.5 text-sm font-semibold focus-visible:ring-2 disabled:opacity-60"
            >
              {restore.isPending ? 'Restoring…' : 'Restore'}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
