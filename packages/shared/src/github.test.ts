import { describe, expect, it } from 'vitest'
import { githubImportInputSchema, syncJobStatsSchema, syncJobSchema } from './github'

describe('githubImportInputSchema', () => {
  it('accepts a gist id', () => {
    expect(githubImportInputSchema.safeParse({ kind: 'gist', ref: 'abc123' }).success).toBe(true)
  })

  it('accepts an owner/repo ref and trims it', () => {
    const parsed = githubImportInputSchema.parse({ kind: 'repo', ref: '  octocat/hello-world ' })

    expect(parsed.ref).toBe('octocat/hello-world')
  })

  it('rejects a repo ref that is not owner/repo', () => {
    expect(githubImportInputSchema.safeParse({ kind: 'repo', ref: 'hello-world' }).success).toBe(
      false,
    )
    expect(githubImportInputSchema.safeParse({ kind: 'repo', ref: 'a/b/c' }).success).toBe(false)
  })

  it('rejects a blank ref and an unknown kind', () => {
    expect(githubImportInputSchema.safeParse({ kind: 'gist', ref: '' }).success).toBe(false)
    expect(githubImportInputSchema.safeParse({ kind: 'org', ref: 'x' }).success).toBe(false)
  })
})

describe('syncJobStatsSchema', () => {
  it('fills missing counters with zero', () => {
    expect(syncJobStatsSchema.parse({})).toEqual({
      total: 0,
      processed: 0,
      imported: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    })
  })

  it('rejects a negative counter', () => {
    expect(syncJobStatsSchema.safeParse({ processed: -1 }).success).toBe(false)
  })
})

describe('syncJobSchema', () => {
  it('accepts a well-formed job', () => {
    const job = {
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'repo_sync',
      status: 'running',
      stats: { total: 5, processed: 2 },
      error: null,
      createdAt: new Date().toISOString(),
      finishedAt: null,
    }

    expect(syncJobSchema.safeParse(job).success).toBe(true)
  })

  it('rejects an unknown status', () => {
    const job = {
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'repo_import',
      status: 'paused',
      stats: {},
      error: null,
      createdAt: new Date().toISOString(),
      finishedAt: null,
    }

    expect(syncJobSchema.safeParse(job).success).toBe(false)
  })
})
