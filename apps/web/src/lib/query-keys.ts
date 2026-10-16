import type { GraphFilters, NoteFilters, SearchFilters } from './api-client'

/**
 * Query key factory. `notesRoot` is a prefix of every list key, so
 * `invalidateQueries({ queryKey: queryKeys.notesRoot })` refreshes all lists.
 */
export const queryKeys = {
  me: ['me'] as const,
  notesRoot: ['notes'] as const,
  notesList: (filters: NoteFilters) => ['notes', filters] as const,
  noteDetail: (id: string) => ['note', id] as const,
  noteBacklinks: (id: string) => ['note', id, 'backlinks'] as const,
  tags: ['tags'] as const,
  search: (filters: SearchFilters) => ['search', filters] as const,
  graphRoot: ['graph'] as const,
  graph: (filters: GraphFilters) => ['graph', filters] as const,
}
