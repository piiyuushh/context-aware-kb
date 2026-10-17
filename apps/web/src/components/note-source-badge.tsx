import type { NoteSource } from '@kb/shared'

const SOURCE_LABEL: Record<Exclude<NoteSource, 'local'>, string> = {
  gist: 'Gist',
  repo: 'Repo',
}

const SOURCE_TONE: Record<Exclude<NoteSource, 'local'>, string> = {
  gist: 'text-link',
  repo: 'text-accent',
}

/**
 * Small uppercase label for where a note was imported from. Local notes render
 * nothing, so a hand-written note looks exactly as it did before GitHub sync.
 */
export function NoteSourceBadge({ source }: { source: NoteSource }) {
  if (source === 'local') return null
  return (
    <span className={`text-[0.7rem] font-semibold tracking-wide uppercase ${SOURCE_TONE[source]}`}>
      {SOURCE_LABEL[source]}
    </span>
  )
}
