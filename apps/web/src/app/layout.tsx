import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Context-Aware Knowledge Base',
    template: '%s | Context-Aware Knowledge Base',
  },
  description:
    'A developer knowledge base for docs, snippets and notes that link themselves, with full-text search, a knowledge graph and GitHub sync.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-canvas text-ink min-h-screen antialiased">{children}</body>
    </html>
  )
}
