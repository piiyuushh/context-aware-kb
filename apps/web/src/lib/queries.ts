'use client'

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import type { AttachTagInput, CreateNoteInput, Note, NoteListResponse, Tag } from '@kb/shared'
import {
  attachTag,
  createNote,
  deleteNote,
  detachTag,
  getBacklinks,
  getMe,
  getNote,
  isClientError,
  listNotes,
  listTags,
  logout,
  searchNotes,
  updateNote,
  type NoteFilters,
  type SearchFilters,
  type UpdateNoteVariables,
} from './api-client'
import { queryKeys } from './query-keys'

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

export function useBacklinks(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.noteBacklinks(id),
    queryFn: ({ signal }) => getBacklinks(id, { signal }),
    enabled: enabled && id.length > 0,
    retry: shouldRetry,
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
      queryClient.removeQueries({ queryKey: queryKeys.noteDetail(id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.notesRoot })
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
