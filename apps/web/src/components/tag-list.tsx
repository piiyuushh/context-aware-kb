'use client'

import type { Tag } from '@kb/shared'

type TagListProps = {
  tags: Tag[]
  activeTag: string | null
  onToggle: (name: string) => void
}

/**
 * Tag filter chips. Each chip is a toggle: `aria-pressed` carries the state and
 * clicking the active chip clears the filter.
 */
export function TagList({ tags, activeTag, onToggle }: TagListProps) {
  if (tags.length === 0) {
    return <p className="text-ink-subtle text-sm">No tags yet. Add one from a note.</p>
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((tag) => {
        const isActive = tag.name === activeTag
        return (
          <li key={tag.id}>
            <button
              type="button"
              aria-pressed={isActive}
              onClick={() => onToggle(tag.name)}
              className={`focus-visible:ring-accent rounded-full border px-2.5 py-1 text-xs focus-visible:ring-2 ${
                isActive
                  ? 'border-accent bg-accent text-accent-ink font-semibold'
                  : 'border-line bg-surface-raised text-ink-muted hover:text-ink'
              }`}
            >
              {tag.name}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
