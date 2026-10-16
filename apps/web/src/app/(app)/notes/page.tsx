import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Notes',
}

export default function NotesPage() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Select a note or create one</h1>
      <p className="text-ink-muted max-w-md text-sm text-pretty">
        Pick a note from the list, or use <span className="font-medium">New note</span> in the
        sidebar. Notes autosave while you type, and the preview renders the markdown beside the
        editor.
      </p>
    </div>
  )
}
