import type { GraphFilters, NoteFilters, SearchFilters } from './api-client'

/**
 * Query key factory. `notesRoot` is a prefix of every list key, so
 * `invalidateQueries({ queryKey: queryKeys.notesRoot })` refreshes all lists.
 * `noteDetail(id)` is a prefix of that note's backlinks and versions, so
 * invalidating it also refreshes the panels hanging off the note.
 */
export const queryKeys = {
  me: ['me'] as const,
  notesRoot: ['notes'] as const,
  notesList: (filters: NoteFilters) => ['notes', filters] as const,
  noteDetail: (id: string) => ['note', id] as const,
  noteBacklinks: (id: string) => ['note', id, 'backlinks'] as const,
  noteVersions: (id: string) => ['note', id, 'versions'] as const,
  tags: ['tags'] as const,
  search: (filters: SearchFilters) => ['search', filters] as const,
  graphRoot: ['graph'] as const,
  graph: (filters: GraphFilters) => ['graph', filters] as const,
  githubGists: ['github', 'gists'] as const,
  githubRepos: ['github', 'repos'] as const,
  syncJob: (id: string) => ['github', 'job', id] as const,
}
