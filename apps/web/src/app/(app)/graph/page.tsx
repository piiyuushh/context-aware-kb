import type { Metadata } from 'next'

import { GraphExplorer } from '@/components/graph-explorer'

export const metadata: Metadata = {
  title: 'Graph',
}

export default function GraphPage() {
  return <GraphExplorer />
}
