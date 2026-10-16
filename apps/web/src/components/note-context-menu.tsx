'use client'

import Link from 'next/link'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { useRef, type KeyboardEvent } from 'react'
import type { Note } from '@kb/shared'

import { NoteTypeBadge } from '@/components/note-type-badge'
import { formatNoteDate } from '@/lib/format'

type NoteContextMenuProps = {
  note: Note
  isActive: boolean
  /** Lets the shell close the sidebar on narrow screens. */
  onNavigate?: () => void
  onRequestDelete: (note: Note) => void
}

/**
 * A sidebar note row. Wraps the link in a Radix context menu so a right-click,
 * a touch long press or the context-menu key (Shift+F10) opens Delete. The
 * Delete key on the focused row opens the same confirmation.
 */
export function NoteContextMenu({
  note,
  isActive,
  onNavigate,
  onRequestDelete,
}: NoteContextMenuProps) {
  const isMenuOpenRef = useRef(false)
  const isPressRef = useRef(false)
  const suppressClickRef = useRef(false)

  return (
    <ContextMenu.Root
      onOpenChange={(open) => {
        isMenuOpenRef.current = open
      }}
    >
      <ContextMenu.Trigger
        asChild
        onPointerDown={(event) => {
          // Mouse right-clicks fire `contextmenu`, not a click; a touch press
          // needs the click after it suppressed.
          isPressRef.current = event.pointerType !== 'mouse'
        }}
        onClickCapture={(event) => {
          // A long press both opens the menu and, on release, would follow the
          // link (and close the mobile sidebar under the menu). Swallow it.
          const openedByPress = isPressRef.current && isMenuOpenRef.current
          isPressRef.current = false
          suppressClickRef.current = openedByPress
          if (openedByPress) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
      >
        <Link
          href={`/notes/${note.id}`}
          aria-current={isActive ? 'page' : undefined}
          aria-keyshortcuts="Delete"
          onClick={(event) => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false
              event.preventDefault()
              return
            }
            onNavigate?.()
          }}
          onKeyDown={(event: KeyboardEvent<HTMLAnchorElement>) => {
            if (event.key !== 'Delete') return
            event.preventDefault()
            event.stopPropagation()
            onRequestDelete(note)
          }}
          className={`focus-visible:ring-accent flex flex-col gap-1 rounded-md border px-3 py-2 focus-visible:ring-2 ${
            isActive
              ? 'border-line-strong bg-surface-raised'
              : 'hover:bg-surface-raised border-transparent'
          }`}
        >
          <span className="truncate text-sm font-medium">{note.title}</span>
          <span className="flex items-center gap-2">
            <NoteTypeBadge type={note.type} />
            <time dateTime={note.updatedAt} className="text-ink-subtle text-xs">
              {formatNoteDate(note.updatedAt)}
            </time>
          </span>
        </Link>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="border-line bg-surface text-ink z-50 min-w-44 rounded-lg border p-1 shadow-2xl">
          <ContextMenu.Item
            onSelect={() => onRequestDelete(note)}
            className="data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-200 flex cursor-default items-center rounded-md px-2 py-1.5 text-sm text-red-300 outline-none select-none"
          >
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
