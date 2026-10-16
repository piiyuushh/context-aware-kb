import type { NoteType } from '@kb/shared'

const TYPE_LABEL: Record<NoteType, string> = {
  doc: 'Doc',
  snippet: 'Snippet',
  note: 'Note',
}

const TYPE_TONE: Record<NoteType, string> = {
  doc: 'text-accent',
  snippet: 'text-link',
  note: 'text-ink-muted',
}

/** Small uppercase label for a note's kind. Colour comes from theme tokens. */
export function NoteTypeBadge({ type }: { type: NoteType }) {
  return (
    <span className={`text-[0.7rem] font-semibold tracking-wide uppercase ${TYPE_TONE[type]}`}>
      {TYPE_LABEL[type]}
    </span>
  )
}
