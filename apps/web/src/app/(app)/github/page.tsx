import type { Metadata } from 'next'

import { GitHubImport } from '@/components/github-import'

export const metadata: Metadata = {
  title: 'GitHub import',
}

export default function GithubPage() {
  return <GitHubImport />
}
