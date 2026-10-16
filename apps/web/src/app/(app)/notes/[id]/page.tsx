import type { Metadata } from 'next'

import { NoteEditor } from '@/components/note-editor'

export const metadata: Metadata = {
  title: 'Note',
}

export default async function NoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <NoteEditor noteId={id} />
}
