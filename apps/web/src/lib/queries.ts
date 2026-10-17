'use client'

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useEffect } from 'react'
import type {
  AttachTagInput,
  CreateNoteInput,
  GitHubImportInput,
  Note,
  NoteListResponse,
  SyncJob,
  SyncJobStatus,
  Tag,
} from '@kb/shared'
import {
  attachTag,
  createNote,
  deleteNote,
  detachTag,
  getBacklinks,
  getGraph,
  getMe,
  getNote,
  getSyncJob,
  isClientError,
  listGists,
  listNoteVersions,
  listNotes,
  listRepos,
  listTags,
  logout,
  restoreNoteVersion,
  searchNotes,
  startGithubImport,
  updateNote,
  type GraphFilters,
  type NoteFilters,
  type SearchFilters,
  type UpdateNoteVariables,
} from './api-client'
import { queryKeys } from './query-keys'

/** How often an in-flight import is polled. */
const SYNC_JOB_POLL_MS = 1500
/**
 * Grace period after an import finishes before tags/edges are re-read. The
 * import completes before the API's per-file process-note jobs attach tags and
 * edges, so the refresh is repeated once those have had a moment to run.
 */
export const SYNC_JOB_SETTLE_MS = 2500

/** What an import can change: the note list, the tags and every graph. */
export function refreshAfterImport(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.notesRoot })
  void queryClient.invalidateQueries({ queryKey: queryKeys.graphRoot })
  void queryClient.invalidateQueries({ queryKey: queryKeys.tags })
}

/** Retry transient failures only: a 4xx will fail again no matter what. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isClientError(error)) return false
  return failureCount < 2
}

/**
 * Applies a PATCH result to every cached list. Tags come from the entry already
 * in the cache, not the response: a tag mutation can land while an autosave
 * PATCH is in flight, and the older PATCH response must not erase it.
 */
function replaceNoteInLists(queryClient: QueryClient, note: Note): void {
  queryClient.setQueriesData<NoteListResponse>({ queryKey: queryKeys.notesRoot }, (previous) => {
    if (!previous) return previous
    let found = false
    const notes = previous.notes.map((item) => {
      if (item.id !== note.id) return item
      found = true
      return { ...note, tags: item.tags }
    })
    return found ? { ...previous, notes } : previous
  })
}

/** Recomputes a note's tags in every cached list through a pure updater. */
function updateNoteTagsInLists(
  queryClient: QueryClient,
  noteId: string,
  update: (tags: Tag[]) => Tag[],
): void {
  queryClient.setQueriesData<NoteListResponse>({ queryKey: queryKeys.notesRoot }, (previous) => {
    if (!previous) return previous
    let found = false
    const notes = previous.notes.map((item) => {
      if (item.id !== noteId) return item
      found = true
      return { ...item, tags: update(item.tags) }
    })
    return found ? { ...previous, notes } : previous
  })
}

/** Drops a deleted note from every cached list so the sidebar updates at once. */
function removeNoteFromLists(queryClient: QueryClient, noteId: string): void {
  queryClient.setQueriesData<NoteListResponse>({ queryKey: queryKeys.notesRoot }, (previous) => {
    if (!previous) return previous
    const notes = previous.notes.filter((item) => item.id !== noteId)
    return notes.length === previous.notes.length ? previous : { ...previous, notes }
  })
}

/** Session state. 401 is a normal answer here, not an error to retry. */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => getMe({ signal }),
    retry: false,
    staleTime: 5 * 60_000,
  })
}

export function useNotes(filters: NoteFilters) {
  return useQuery({
    queryKey: queryKeys.notesList(filters),
    queryFn: ({ signal }) => listNotes(filters, { signal }),
    retry: shouldRetry,
    // Keep the previous page on screen while a new search term loads.
    placeholderData: keepPreviousData,
  })
}

/** Ranked full-text search. Blank terms never hit the API. */
export function useSearchNotes(filters: SearchFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.search(filters),
    queryFn: ({ signal }) => searchNotes(filters, { signal }),
    enabled: enabled && (filters.q ?? '').trim().length > 0,
    retry: shouldRetry,
    // Keep the last hits on screen while the next term loads.
    placeholderData: keepPreviousData,
  })
}

export function useNote(id: string) {
  return useQuery({
    queryKey: queryKeys.noteDetail(id),
    queryFn: ({ signal }) => getNote(id, { signal }),
    enabled: id.length > 0,
    retry: shouldRetry,
  })
}

export function useTags() {
  return useQuery({
    queryKey: queryKeys.tags,
    queryFn: ({ signal }) => listTags({ signal }),
    retry: shouldRetry,
  })
}

/**
 * The filtered knowledge graph. Keeps the previous graph on screen while new
 * filters load, so switching a filter re-heats the existing layout instead of
 * flashing an empty canvas.
 */
export function useGraph(filters: GraphFilters) {
  return useQuery({
    queryKey: queryKeys.graph(filters),
    queryFn: ({ signal }) => getGraph(filters, { signal }),
    retry: shouldRetry,
    placeholderData: keepPreviousData,
  })
}

export function useBacklinks(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.noteBacklinks(id),
    queryFn: ({ signal }) => getBacklinks(id, { signal }),
    enabled: enabled && id.length > 0,
    retry: shouldRetry,
  })
}

/**
 * A note's stored revisions, newest first. The history panel is only mounted
 * while it is open, so opening a note costs one request, not two.
 */
export function useNoteVersions(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.noteVersions(id),
    queryFn: ({ signal }) => listNoteVersions(id, { signal }),
    enabled: enabled && id.length > 0,
    retry: shouldRetry,
  })
}

/**
 * Replaces a note with an older revision. The API returns the restored note, so
 * it is written straight into the detail cache (keeping the tags already
 * cached, the same way `useUpdateNote` does) and everything derived from the
 * note is invalidated.
 */
export function useRestoreNoteVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, versionId }: { id: string; versionId: string }) =>
      restoreNoteVersion(id, versionId),
    onSuccess: (note) => {
      queryClient.setQueryData<Note>(queryKeys.noteDetail(note.id), (previous) =>
        previous ? { ...note, tags: previous.tags } : note,
      )
      replaceNoteInLists(queryClient, note)
      void queryClient.invalidateQueries({ queryKey: queryKeys.notesRoot })
      void queryClient.invalidateQueries({ queryKey: queryKeys.graphRoot })
      void queryClient.invalidateQueries({ queryKey: queryKeys.tags })
      void queryClient.invalidateQueries({ queryKey: queryKeys.noteVersions(note.id) })
    },
  })
}

/** True while a job can still advance, so polling has a reason to continue. */
function isSyncJobActive(status: SyncJobStatus): boolean {
  return status === 'queued' || status === 'running'
}

/** The caller's gists, newest first. */
export function useGithubGists(enabled = true) {
  return useQuery({
    queryKey: queryKeys.githubGists,
    queryFn: ({ signal }) => listGists({ signal }),
    enabled,
    retry: shouldRetry,
  })
}

/** Repositories the token can see, most recently updated first. */
export function useGithubRepos(enabled = true) {
  return useQuery({
    queryKey: queryKeys.githubRepos,
    queryFn: ({ signal }) => listRepos({ signal }),
    enabled,
    retry: shouldRetry,
  })
}

/**
 * A background import, polled while it is queued or running and left alone once
 * it is done or failed. A finished import invalidates the note list, the tags
 * and the graph so imported notes appear without a manual refresh.
 */
export function useSyncJob(id: string, enabled = true) {
  const queryClient = useQueryClient()
  const jobQuery = useQuery({
    queryKey: queryKeys.syncJob(id),
    queryFn: ({ signal }) => getSyncJob(id, { signal }),
    enabled: enabled && id.length > 0,
    retry: shouldRetry,
    refetchInterval: (query) => {
      // A failed poll stops the loop; the panel's "Try again" refetches by hand.
      if (query.state.error) return false
      const job = query.state.data
      // Poll until the first response lands, then only while progress is left.
      if (job === undefined || isSyncJobActive(job.status)) return SYNC_JOB_POLL_MS
      return false
    },
  })

  const status = jobQuery.data?.status
  useEffect(() => {
    if (status !== 'done') return
    refreshAfterImport(queryClient)
    const settle = window.setTimeout(() => refreshAfterImport(queryClient), SYNC_JOB_SETTLE_MS)
    return () => window.clearTimeout(settle)
  }, [status, queryClient])

  return jobQuery
}

export function useStartImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: GitHubImportInput) => startGithubImport(input),
    // Seed the job cache so the progress panel renders the accepted job at once.
    onSuccess: (job) => {
      queryClient.setQueryData<SyncJob>(queryKeys.syncJob(job.id), job)
    },
  })
}

export function useCreateNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateNoteInput) => createNote(input),
    onSuccess: (note) => {
      queryClient.setQueryData(queryKeys.noteDetail(note.id), note)
      void queryClient.invalidateQueries({ queryKey: queryKeys.notesRoot })
    },
  })
}

export function useUpdateNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: UpdateNoteVariables) => updateNote(id, input),
    onSuccess: (note) => {
      // Keep the tags already cached: a concurrent tag mutation is newer than
      // this PATCH response.
      queryClient.setQueryData<Note>(queryKeys.noteDetail(note.id), (previous) =>
        previous ? { ...note, tags: previous.tags } : note,
      )
      replaceNoteInLists(queryClient, note)
    },
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteNote(id),
    onSuccess: (_data, id) => {
      // Remove the note from every cached view up front, then revalidate the
      // list and graph so cursor pages and edges reconcile with the server.
      removeNoteFromLists(queryClient, id)
      queryClient.removeQueries({ queryKey: queryKeys.noteDetail(id) })
      queryClient.removeQueries({ queryKey: queryKeys.noteBacklinks(id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.notesRoot })
      void queryClient.invalidateQueries({ queryKey: queryKeys.graphRoot })
    },
  })
}

export function useAddTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ noteId, input }: { noteId: string; input: AttachTagInput }) =>
      attachTag(noteId, input),
    onSuccess: (tag, variables) => {
      const addTag = (tags: Tag[]): Tag[] =>
        tags.some((item) => item.id === tag.id) ? tags : [...tags, tag]
      queryClient.setQueryData<Note>(queryKeys.noteDetail(variables.noteId), (previous) =>
        previous ? { ...previous, tags: addTag(previous.tags) } : previous,
      )
      updateNoteTagsInLists(queryClient, variables.noteId, addTag)
      void queryClient.invalidateQueries({ queryKey: queryKeys.tags })
    },
  })
}

export function useRemoveTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ noteId, tagId }: { noteId: string; tagId: string }) => detachTag(noteId, tagId),
    onSuccess: (_data, variables) => {
      const withoutTag = (tags: Tag[]): Tag[] => tags.filter((item) => item.id !== variables.tagId)
      queryClient.setQueryData<Note>(queryKeys.noteDetail(variables.noteId), (previous) =>
        previous ? { ...previous, tags: withoutTag(previous.tags) } : previous,
      )
      updateNoteTagsInLists(queryClient, variables.noteId, withoutTag)
      void queryClient.invalidateQueries({ queryKey: queryKeys.tags })
    },
  })
}

/** Clears every cached query, including the session used by `AuthGuard`. */
export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => logout(),
    onSettled: () => {
      queryClient.clear()
    },
  })
}
