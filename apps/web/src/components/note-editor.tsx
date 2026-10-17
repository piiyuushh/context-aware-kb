'use client'

import Link from 'next/link'
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  attachTagInputSchema,
  noteExportFilename,
  noteIdParamsSchema,
  type Note,
  type UpdateNoteInput,
} from '@kb/shared'

import { CodeMirrorEditor } from '@/components/code-mirror-editor'
import { MarkdownPreview } from '@/components/markdown-preview'
import { NoteHistory } from '@/components/note-history'
import { NoteSourceBadge } from '@/components/note-source-badge'
import { NoteTypeBadge } from '@/components/note-type-badge'
import { isApiError, noteExportUrl } from '@/lib/api-client'
import { formatNoteDate } from '@/lib/format'
import { useAddTag, useBacklinks, useNote, useRemoveTag, useUpdateNote } from '@/lib/queries'
import { useDebouncedValue } from '@/lib/use-debounced-value'

/** Quiet period before an edit is PATCHed. */
const SAVE_DEBOUNCE_MS = 800
/** Re-arm delay when a save is still in flight, so writes stay ordered. */
const RESAVE_DELAY_MS = 200
/** The preview re-renders markdown, so it lags the editor a little. */
const PREVIEW_DEBOUNCE_MS = 200
const MAX_TITLE_LENGTH = 500

/** Shared by the header's secondary actions (history, export, preview). */
const SECONDARY_BUTTON_CLASS =
  'border-line-strong bg-surface-raised text-ink hover:bg-surface focus-visible:ring-accent rounded-md border px-2.5 py-1.5 text-xs focus-visible:ring-2'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

type Drafts = {
  title: string
  contentMd: string
}

type PendingSave = {
  noteId: string
  input: UpdateNoteInput
}

const SAVE_STATUS_TEXT: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Could not save — press Ctrl or ⌘ + S to retry',
}

function CenteredState({ children, alert = false }: { children: ReactNode; alert?: boolean }) {
  return (
    <div
      role={alert ? 'alert' : undefined}
      className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center"
    >
      {children}
    </div>
  )
}

function NoteNotFound() {
  return (
    <CenteredState>
      <h1 className="text-xl font-semibold tracking-tight">Note not found</h1>
      <p className="text-ink-muted max-w-md text-sm text-pretty">
        This note does not exist, or it belongs to another account.
      </p>
      <Link href="/notes" className="text-link rounded underline underline-offset-2">
        Back to notes
      </Link>
    </CenteredState>
  )
}

/** Loads the note, then hands off to a per-note pane so autosave state is fresh. */
export function NoteEditor({ noteId }: { noteId: string }) {
  const noteQuery = useNote(noteId)
  // Bumped when a revision is restored: the pane is keyed by it, so remounting
  // re-seeds the drafts from the note the restore wrote into the cache.
  const [reloadKey, setReloadKey] = useState(0)
  // Held here rather than in the pane so the panel survives that remount.
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)

  // A non-uuid id would only ever 400 at the API, so skip straight to not-found.
  if (!noteIdParamsSchema.safeParse({ id: noteId }).success) {
    return <NoteNotFound />
  }

  if (noteQuery.isPending) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6" role="status">
        <p className="text-ink-muted text-sm">Loading note…</p>
      </div>
    )
  }

  if (noteQuery.isError && isApiError(noteQuery.error) && noteQuery.error.status === 404) {
    return <NoteNotFound />
  }

  const note = noteQuery.data

  if (noteQuery.isError || note === undefined) {
    return (
      <CenteredState alert>
        <h1 className="text-xl font-semibold tracking-tight">Could not load this note</h1>
        <p className="text-ink-muted max-w-md text-sm">
          The API did not answer. Check that it is running, then try again.
        </p>
        <button
          type="button"
          onClick={() => void noteQuery.refetch()}
          className="border-line-strong bg-surface-raised text-ink focus-visible:ring-accent rounded-md border px-3 py-1.5 text-sm focus-visible:ring-2"
        >
          Try again
        </button>
      </CenteredState>
    )
  }

  // Keyed so switching notes starts from that note's own draft state, and so a
  // restore can force the pane to re-read the note; the unmount cleanup flushes
  // anything unsaved.
  return (
    <NoteEditorPane
      key={`${note.id}:${reloadKey}`}
      note={note}
      isHistoryOpen={isHistoryOpen}
      onToggleHistory={() => setIsHistoryOpen((open) => !open)}
      onRestored={() => setReloadKey((key) => key + 1)}
    />
  )
}

type NoteEditorPaneProps = {
  note: Note
  isHistoryOpen: boolean
  onToggleHistory: () => void
  /** Called after a revision was restored, to remount the pane. */
  onRestored: () => void
}

function NoteEditorPane({ note, isHistoryOpen, onToggleHistory, onRestored }: NoteEditorPaneProps) {
  const noteId = note.id
  const updateNote = useUpdateNote()
  const addTag = useAddTag()
  const removeTag = useRemoveTag()
  const backlinksQuery = useBacklinks(noteId)

  const [drafts, setDrafts] = useState<Drafts>(() => ({
    title: note.title,
    contentMd: note.contentMd,
  }))
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [showPreview, setShowPreview] = useState(true)
  const [tagDraft, setTagDraft] = useState('')
  const [tagError, setTagError] = useState<string | null>(null)

  // The preview re-parses markdown with highlighter + sanitizer, so it trails
  // the editor slightly instead of running on every keystroke.
  const previewContent = useDebouncedValue(drafts.contentMd, PREVIEW_DEBOUNCE_MS)

  const draftsRef = useRef<Drafts>(drafts)
  const savedRef = useRef<Drafts>({ title: note.title, contentMd: note.contentMd })
  const pendingRef = useRef<PendingSave | null>(null)
  const timerRef = useRef<number | null>(null)
  const inFlightRef = useRef(false)
  const mountedRef = useRef(true)
  const runPendingRef = useRef<() => void>(() => {})
  const saveNowRef = useRef<() => void>(() => {})

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const armTimer = (delay: number) => {
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      runPendingRef.current()
    }, delay)
  }

  const setStatusIfMounted = (next: SaveStatus) => {
    if (mountedRef.current) setStatus(next)
  }

  /** Only the fields that actually differ from the last saved revision. */
  const inputFromDrafts = (next: Drafts): UpdateNoteInput | null => {
    const saved = savedRef.current
    const title = next.title.trim()
    const input: UpdateNoteInput = {}
    if (title.length > 0 && title !== saved.title) input.title = title
    if (next.contentMd !== saved.contentMd) input.contentMd = next.contentMd
    return Object.keys(input).length > 0 ? input : null
  }

  const runPending = () => {
    if (inFlightRef.current) {
      // Wait for the current PATCH so the newest draft is written last.
      armTimer(RESAVE_DELAY_MS)
      return
    }

    const pending = pendingRef.current
    if (pending === null) return
    pendingRef.current = null
    inFlightRef.current = true
    setStatusIfMounted('saving')

    let failed = false
    updateNote
      .mutateAsync({ id: pending.noteId, input: pending.input })
      .then(
        (updated) => {
          savedRef.current = { title: updated.title, contentMd: updated.contentMd }
        },
        (_error: unknown) => {
          failed = true
        },
      )
      .finally(() => {
        inFlightRef.current = false
        if (pendingRef.current !== null) {
          runPendingRef.current()
        } else {
          setStatusIfMounted(failed ? 'error' : 'saved')
        }
      })
  }

  const scheduleSave = (next: Drafts) => {
    const input = inputFromDrafts(next)
    if (input === null) {
      clearTimer()
      pendingRef.current = null
      setStatusIfMounted('saved')
      return
    }
    pendingRef.current = { noteId, input }
    setStatusIfMounted('saving')
    armTimer(SAVE_DEBOUNCE_MS)
  }

  const applyDrafts = (next: Drafts) => {
    draftsRef.current = next
    setDrafts(next)
    scheduleSave(next)
  }

  /** Mod-s: write the current draft straight away. */
  const saveNow = () => {
    const input = inputFromDrafts(draftsRef.current)
    if (input === null) {
      clearTimer()
      pendingRef.current = null
      setStatusIfMounted('saved')
      return
    }
    pendingRef.current = { noteId, input }
    clearTimer()
    runPendingRef.current()
  }

  // The latest closures, so timers, key handlers and the unmount flush never
  // run stale code.
  useEffect(() => {
    runPendingRef.current = runPending
    saveNowRef.current = saveNow
  })

  // Flush a pending save when leaving the note (React unmount) or the tab
  // (`pagehide`, which React never sees). The mutation keeps running after
  // unmount, so the cache still reflects the write.
  useEffect(() => {
    mountedRef.current = true
    const flush = () => runPendingRef.current()
    window.addEventListener('pagehide', flush)
    return () => {
      mountedRef.current = false
      window.removeEventListener('pagehide', flush)
      clearTimer()
      runPendingRef.current()
    }
  }, [])

  // Mod-s saves immediately wherever focus is, matching the status copy.
  // CodeMirror handles it while the editor is focused and calls preventDefault,
  // so this skips those to avoid a double save.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveNowRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const onTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    applyDrafts({ ...draftsRef.current, title: event.target.value })
  }

  const onTitleBlur = () => {
    if (draftsRef.current.title.trim().length > 0) return
    // A note always has a title, so an empty one reverts to the saved value.
    // Recompute rather than clear, so a pending content change survives.
    const next = { ...draftsRef.current, title: savedRef.current.title }
    draftsRef.current = next
    setDrafts(next)
    scheduleSave(next)
  }

  const onContentChange = (value: string) => {
    applyDrafts({ ...draftsRef.current, contentMd: value })
  }

  const onTagSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = attachTagInputSchema.safeParse({ name: tagDraft })
    if (!parsed.success) {
      setTagError('Tags must be 1 to 50 characters.')
      return
    }
    const isDuplicate = note.tags.some(
      (tag) => tag.name.toLowerCase() === parsed.data.name.toLowerCase(),
    )
    if (isDuplicate) {
      setTagError(`"${parsed.data.name}" is already on this note.`)
      return
    }
    setTagError(null)
    addTag.mutate(
      { noteId, input: parsed.data },
      {
        onSuccess: () => setTagDraft(''),
        onError: () => setTagError('Could not add that tag.'),
      },
    )
  }

  const backlinks = backlinksQuery.data ?? []

  return (
    <div className="flex flex-col">
      <header className="border-line flex flex-col gap-3 border-b px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <NoteTypeBadge type={note.type} />
          <NoteSourceBadge source={note.source} />
          <time dateTime={note.updatedAt} className="text-ink-subtle text-xs">
            Updated {formatNoteDate(note.updatedAt)}
          </time>
          <div className="ml-auto flex items-center gap-3">
            <p
              role="status"
              aria-live="polite"
              className="text-ink-muted min-h-4 text-right text-xs"
            >
              {SAVE_STATUS_TEXT[status]}
            </p>
            <button
              type="button"
              aria-pressed={isHistoryOpen}
              aria-expanded={isHistoryOpen}
              aria-controls={isHistoryOpen ? 'note-history' : undefined}
              onClick={onToggleHistory}
              className={SECONDARY_BUTTON_CLASS}
            >
              {isHistoryOpen ? 'Hide history' : 'History'}
            </button>
            {/*
              A plain same-origin anchor, not fetch: the browser sends the
              session cookie and honours the Content-Disposition attachment.
            */}
            <a
              href={noteExportUrl(noteId)}
              download={noteExportFilename(note)}
              className={SECONDARY_BUTTON_CLASS}
            >
              Export .md
            </a>
            <button
              type="button"
              aria-pressed={showPreview}
              onClick={() => setShowPreview((visible) => !visible)}
              className={SECONDARY_BUTTON_CLASS}
            >
              {showPreview ? 'Hide preview' : 'Show preview'}
            </button>
          </div>
        </div>

        <input
          type="text"
          aria-label="Note title"
          value={drafts.title}
          onChange={onTitleChange}
          onBlur={onTitleBlur}
          maxLength={MAX_TITLE_LENGTH}
          placeholder="Untitled"
          className="hover:border-line focus-visible:border-line-strong focus-visible:ring-accent focus-visible:ring-offset-canvas w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-xl font-semibold tracking-tight focus-visible:ring-2 focus-visible:ring-offset-2"
        />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-ink-subtle text-xs font-medium uppercase">Tags</span>
          <ul className="flex flex-wrap items-center gap-1.5">
            {note.tags.map((tag) => (
              <li key={tag.id}>
                <span className="border-line bg-surface-raised text-ink-muted flex items-center gap-1 rounded-full border py-1 pr-1 pl-2.5 text-xs">
                  {tag.name}
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag.name}`}
                    onClick={() => removeTag.mutate({ noteId, tagId: tag.id })}
                    className="hover:text-ink focus-visible:ring-accent rounded-full px-1 focus-visible:ring-2"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <form onSubmit={onTagSubmit}>
            <input
              type="text"
              aria-label="Add a tag"
              value={tagDraft}
              onChange={(event) => setTagDraft(event.target.value)}
              maxLength={50}
              placeholder="Add tag…"
              autoComplete="off"
              className="border-line bg-surface text-ink placeholder:text-ink-subtle focus-visible:ring-accent w-32 rounded-md border px-2.5 py-1 text-xs focus-visible:ring-2"
            />
          </form>
        </div>

        {tagError !== null && (
          <p role="alert" className="text-ink text-xs">
            {tagError}
          </p>
        )}
      </header>

      {isHistoryOpen && <NoteHistory noteId={noteId} onRestored={onRestored} />}

      <div className={showPreview ? 'grid grid-cols-1 lg:grid-cols-2' : 'grid grid-cols-1'}>
        <section
          aria-label="Markdown editor"
          className={`h-[60vh] min-h-0 ${showPreview ? 'border-line lg:border-r' : ''}`}
        >
          <CodeMirrorEditor
            value={drafts.contentMd}
            onChange={onContentChange}
            onSave={saveNow}
            ariaLabel="Markdown content"
            placeholder="# Start writing…"
          />
        </section>
        {showPreview && (
          <section
            aria-label="Markdown preview"
            className="h-[60vh] min-h-0 overflow-y-auto p-4 sm:p-6"
          >
            <MarkdownPreview content={previewContent} />
          </section>
        )}
      </div>

      {backlinks.length > 0 && (
        <section
          aria-labelledby="backlinks-heading"
          className="border-line border-t px-4 py-4 sm:px-6"
        >
          <h2 id="backlinks-heading" className="text-ink-muted text-xs font-medium uppercase">
            Linked from {backlinks.length} {backlinks.length === 1 ? 'note' : 'notes'}
          </h2>
          <ul className="mt-2 flex flex-col gap-1">
            {backlinks.map((backlink) => (
              <li key={backlink.id}>
                <Link
                  href={`/notes/${backlink.id}`}
                  className="text-link rounded text-sm underline underline-offset-2"
                >
                  {backlink.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
