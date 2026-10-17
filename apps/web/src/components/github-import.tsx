'use client'

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import type {
  GitHubGist,
  GitHubImportKind,
  GitHubRepo,
  SyncJob,
  SyncJobStats,
  SyncJobStatus,
} from '@kb/shared'

import { isApiError } from '@/lib/api-client'
import { formatNoteDate } from '@/lib/format'
import { useGithubGists, useGithubRepos, useStartImport, useSyncJob } from '@/lib/queries'

const TABS = [
  { id: 'gists', label: 'Gists' },
  { id: 'repos', label: 'Repositories' },
] as const

type TabId = (typeof TABS)[number]['id']

/** A row the user picked; `ref` is a gist id or an `owner/repo` full name. */
type SelectedTarget = {
  kind: GitHubImportKind
  ref: string
  label: string
}

type ImportError = {
  message: string
  /** A 400 means the account has no GitHub connection, so nothing can import. */
  disconnected: boolean
}

const JOB_STATUS_LABEL: Record<SyncJobStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  done: 'Finished',
  failed: 'Failed',
}

/**
 * True for the statuses that mean "the token cannot read this": no connection
 * (400), an invalid or revoked token (401), or a rate limit / missing scope
 * (403). All three are fixed by reconnecting GitHub.
 */
function isGithubAccessError(error: unknown): boolean {
  return isApiError(error) && (error.status === 400 || error.status === 401 || error.status === 403)
}

function toImportError(error: unknown): ImportError {
  if (isGithubAccessError(error)) {
    return {
      message:
        'GitHub could not be reached with your current access. Reconnect GitHub to grant access to your gists and repositories — if you just hit a rate limit, try again in a few minutes.',
      disconnected: true,
    }
  }
  if (isApiError(error) && error.status === 404) {
    return {
      message: 'That gist or repository was not found, or it is private to your GitHub token.',
      disconnected: false,
    }
  }
  return {
    message: 'Could not start the import. Check that the API is running, then try again.',
    disconnected: false,
  }
}

/** Arrow-key navigation for the tab strip, with Home/End to jump to either end. */
function nextTabId(current: TabId, key: string): TabId | null {
  const index = TABS.findIndex((tab) => tab.id === current)
  switch (key) {
    case 'ArrowRight':
      return (TABS[(index + 1) % TABS.length] ?? TABS[0]).id
    case 'ArrowLeft':
      return (TABS[(index - 1 + TABS.length) % TABS.length] ?? TABS[0]).id
    case 'Home':
      return TABS[0].id
    case 'End':
      return (TABS[TABS.length - 1] ?? TABS[0]).id
    default:
      return null
  }
}

function optionRowClass(isSelected: boolean, isDisabled: boolean): string {
  const base = 'flex items-start gap-3 rounded-md border px-3 py-2'
  if (isDisabled)
    return `${base} border-transparent bg-surface-raised cursor-not-allowed opacity-60`
  return isSelected
    ? `${base} border-accent bg-accent/10 cursor-pointer`
    : `${base} border-transparent hover:bg-surface-raised cursor-pointer`
}

function fileCount(count: number): string {
  return count === 1 ? '1 file' : `${count} files`
}

function ListError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-2">
      <p className="text-ink text-sm">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="border-line-strong bg-surface-raised text-ink focus-visible:ring-accent self-start rounded-md border px-2.5 py-1 text-xs focus-visible:ring-2"
      >
        Try again
      </button>
    </div>
  )
}

type GistOptionProps = {
  gist: GitHubGist
  name: string
  isSelected: boolean
  isDisabled: boolean
  onSelect: () => void
}

function GistOption({ gist, name, isSelected, isDisabled, onSelect }: GistOptionProps) {
  return (
    <label className={optionRowClass(isSelected, isDisabled)}>
      <input
        type="radio"
        name={name}
        value={gist.id}
        checked={isSelected}
        disabled={isDisabled}
        onChange={onSelect}
        className="accent-accent mt-0.5 size-4 shrink-0"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-ink truncate text-sm font-medium">
          {gist.description ?? gist.files[0] ?? gist.id}
        </span>
        <span className="text-ink-subtle flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span>{fileCount(gist.files.length)}</span>
          {gist.updatedAt !== null && (
            <time dateTime={gist.updatedAt}>Updated {formatNoteDate(gist.updatedAt)}</time>
          )}
        </span>
      </span>
    </label>
  )
}

type RepoOptionProps = {
  repo: GitHubRepo
  name: string
  isSelected: boolean
  isDisabled: boolean
  onSelect: () => void
}

function RepoOption({ repo, name, isSelected, isDisabled, onSelect }: RepoOptionProps) {
  return (
    <label className={optionRowClass(isSelected, isDisabled)}>
      <input
        type="radio"
        name={name}
        value={repo.fullName}
        checked={isSelected}
        disabled={isDisabled}
        onChange={onSelect}
        className="accent-accent mt-0.5 size-4 shrink-0"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="text-ink truncate text-sm font-medium">{repo.fullName}</span>
          {repo.private && (
            <span className="border-line bg-surface-raised text-ink-muted shrink-0 rounded-full border px-2 py-0.5 text-[0.7rem]">
              Private
            </span>
          )}
        </span>
        {repo.description !== null && (
          <span className="text-ink-muted line-clamp-2 text-xs">{repo.description}</span>
        )}
        <span className="text-ink-subtle flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span>{repo.defaultBranch}</span>
          {repo.updatedAt !== null && (
            <time dateTime={repo.updatedAt}>Updated {formatNoteDate(repo.updatedAt)}</time>
          )}
        </span>
      </span>
    </label>
  )
}

function ImportControls({
  label,
  selection,
  isDisabled,
  isPending,
  onImport,
}: {
  label: string
  selection: SelectedTarget | null
  isDisabled: boolean
  isPending: boolean
  onImport: () => void
}) {
  return (
    <div className="border-line flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center">
      <p role="status" className="text-ink-muted min-w-0 flex-1 text-sm">
        {selection === null ? 'Select an item above to import it.' : `Selected: ${selection.label}`}
      </p>
      <button
        type="button"
        onClick={onImport}
        disabled={isDisabled}
        aria-busy={isPending}
        className="bg-accent text-accent-ink hover:bg-accent-strong focus-visible:ring-accent focus-visible:ring-offset-surface shrink-0 rounded-md px-3 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {isPending ? 'Starting…' : label}
      </button>
    </div>
  )
}

function SourcePanel({
  id,
  labelledBy,
  isActive,
  children,
}: {
  id: string
  labelledBy: string
  isActive: boolean
  children: ReactNode
}) {
  return (
    <div
      role="tabpanel"
      id={id}
      aria-labelledby={labelledBy}
      // Both panels stay mounted so each tab's `aria-controls` resolves; the
      // inactive one is display:none (also hiding its radios from the tab order).
      className={`border-line bg-surface flex-col gap-4 rounded-lg border p-4 ${
        isActive ? 'flex' : 'hidden'
      }`}
    >
      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <dt className="text-ink-subtle text-xs tracking-wide uppercase">{label}</dt>
      <dd className="text-ink text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function SyncJobStatsView({ stats }: { stats: SyncJobStats }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      <Stat label="Processed" value={`${stats.processed} / ${stats.total}`} />
      <Stat label="Imported" value={stats.imported} />
      <Stat label="Updated" value={stats.updated} />
      <Stat label="Skipped" value={stats.skipped} />
      <Stat label="Failed" value={stats.failed} />
    </dl>
  )
}

function jobStatusText(job: SyncJob): string {
  switch (job.status) {
    case 'queued':
      return 'Import queued. It will start in a moment.'
    case 'running':
      return job.stats.total > 0
        ? `Importing ${job.stats.processed} of ${job.stats.total} files…`
        : 'Importing files…'
    case 'done':
      return `Import finished: ${job.stats.imported} imported, ${job.stats.updated} updated, ${job.stats.skipped} skipped.`
    case 'failed':
      return 'The import failed.'
  }
}

/**
 * Live view of one background import. `useSyncJob` owns the polling, so this
 * only renders whatever status the query last reported.
 */
function SyncJobPanel({ jobId, onDismiss }: { jobId: string; onDismiss: () => void }) {
  const jobQuery = useSyncJob(jobId)
  const job = jobQuery.data
  const headingId = useId()

  const statusText = jobQuery.isPending
    ? 'Loading import progress…'
    : jobQuery.isError || job === undefined
      ? 'Could not load import progress.'
      : jobStatusText(job)

  return (
    <section
      aria-labelledby={headingId}
      className="border-line bg-surface flex flex-col gap-3 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={headingId} className="text-sm font-semibold tracking-tight">
          Import progress
        </h2>
        {job !== undefined && (
          <span className="border-line bg-surface-raised text-ink-muted rounded-full border px-2 py-0.5 text-xs">
            {JOB_STATUS_LABEL[job.status]}
          </span>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="border-line-strong bg-surface-raised text-ink hover:bg-surface focus-visible:ring-accent ml-auto rounded-md border px-2.5 py-1 text-xs focus-visible:ring-2"
        >
          Dismiss
        </button>
      </div>

      <p role="status" aria-live="polite" className="text-ink-muted text-sm">
        {statusText}
      </p>

      {job !== undefined && <SyncJobStatsView stats={job.stats} />}

      {jobQuery.isError && (
        <button
          type="button"
          onClick={() => void jobQuery.refetch()}
          className="border-line-strong bg-surface-raised text-ink focus-visible:ring-accent self-start rounded-md border px-2.5 py-1 text-xs focus-visible:ring-2"
        >
          Try again
        </button>
      )}

      {job?.status === 'failed' && job.error !== null && (
        <p role="alert" className="text-ink text-sm">
          {job.error}
        </p>
      )}
    </section>
  )
}

/**
 * `/github`: pick a gist or repository, start an import, and watch the job. The
 * two lists are tabs because GitHub's gist and repo payloads have different
 * shapes — mixing them in one list would need a discriminated union.
 */
export function GitHubImport() {
  const [activeTab, setActiveTab] = useState<TabId>('gists')
  const [selection, setSelection] = useState<SelectedTarget | null>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [importError, setImportError] = useState<ImportError | null>(null)
  const radioGroupName = useId()

  const gistsQuery = useGithubGists()
  const reposQuery = useGithubRepos()
  const startImport = useStartImport()

  const gistsDisconnected = gistsQuery.isError && isGithubAccessError(gistsQuery.error)
  const reposDisconnected = reposQuery.isError && isGithubAccessError(reposQuery.error)
  const isDisconnected =
    importError?.disconnected === true || gistsDisconnected || reposDisconnected

  const isSelected = (kind: GitHubImportKind, ref: string) =>
    selection !== null && selection.kind === kind && selection.ref === ref

  const selectTab = (tab: TabId) => {
    // Re-selecting the open tab must not discard the current pick.
    if (tab === activeTab) return
    setActiveTab(tab)
    // The selection belongs to the visible list, so drop it when the list changes.
    setSelection(null)
  }

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: TabId) => {
    const next = nextTabId(current, event.key)
    if (next === null) return
    event.preventDefault()
    selectTab(next)
    document.getElementById(`github-tab-${next}`)?.focus()
  }

  const onImport = () => {
    if (selection === null) return
    setImportError(null)
    startImport.mutate(
      { kind: selection.kind, ref: selection.ref },
      {
        onSuccess: (job) => setActiveJobId(job.id),
        onError: (error) => setImportError(toImportError(error)),
      },
    )
  }

  const gists = gistsQuery.data ?? []
  const repos = reposQuery.data ?? []

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">Import from GitHub</h1>
        <p className="text-ink-muted text-sm text-pretty">
          Pull markdown from your gists and repositories. Files that have not changed upstream are
          skipped, and imports run in the background with live progress below.
        </p>
      </header>

      {isDisconnected && (
        <div
          role="alert"
          className="border-line bg-surface-raised flex flex-col gap-1 rounded-md border px-4 py-3"
        >
          <p className="text-ink text-sm font-medium">GitHub access is unavailable</p>
          <p className="text-ink-muted text-xs">
            Sign out and sign in with GitHub again to grant access to your gists and repositories.
            If you just hit a rate limit, try again in a few minutes.
          </p>
        </div>
      )}

      <div
        role="tablist"
        aria-label="GitHub sources"
        className="flex flex-wrap items-center gap-1.5"
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab
          const count = tab.id === 'gists' ? gistsQuery.data?.length : reposQuery.data?.length
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`github-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`github-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => onTabKeyDown(event, tab.id)}
              className={`focus-visible:ring-accent flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm focus-visible:ring-2 ${
                isActive
                  ? 'border-accent bg-accent/15 text-accent font-semibold'
                  : 'border-line bg-surface-raised text-ink-muted hover:text-ink'
              }`}
            >
              {tab.label}
              {count !== undefined && (
                <span className="text-ink-subtle text-xs tabular-nums">{count}</span>
              )}
            </button>
          )
        })}
      </div>

      <SourcePanel
        id="github-panel-gists"
        labelledBy="github-tab-gists"
        isActive={activeTab === 'gists'}
      >
        {gistsQuery.isPending ? (
          <p role="status" className="text-ink-subtle text-sm">
            Loading your gists…
          </p>
        ) : gistsQuery.isError ? (
          <ListError
            message={
              gistsDisconnected
                ? 'GitHub access is unavailable, so your gists could not be read.'
                : 'Could not load your gists.'
            }
            onRetry={() => void gistsQuery.refetch()}
          />
        ) : gists.length === 0 ? (
          <p className="text-ink-subtle text-sm">You have no gists to import.</p>
        ) : (
          <div
            role="radiogroup"
            aria-labelledby="gist-list-heading"
            className="flex flex-col gap-2"
          >
            <h2
              id="gist-list-heading"
              className="text-ink-muted text-xs font-medium tracking-wide uppercase"
            >
              Select a gist to import
            </h2>
            <div className="flex flex-col gap-1.5">
              {gists.map((gist) => (
                <GistOption
                  key={gist.id}
                  gist={gist}
                  name={`${radioGroupName}-gists`}
                  isSelected={isSelected('gist', gist.id)}
                  isDisabled={isDisconnected}
                  onSelect={() =>
                    setSelection({
                      kind: 'gist',
                      ref: gist.id,
                      label: gist.description ?? gist.files[0] ?? gist.id,
                    })
                  }
                />
              ))}
            </div>
          </div>
        )}

        <ImportControls
          label="Import gist"
          selection={selection}
          isDisabled={selection === null || startImport.isPending || isDisconnected}
          isPending={startImport.isPending}
          onImport={onImport}
        />
      </SourcePanel>

      <SourcePanel
        id="github-panel-repos"
        labelledBy="github-tab-repos"
        isActive={activeTab === 'repos'}
      >
        {reposQuery.isPending ? (
          <p role="status" className="text-ink-subtle text-sm">
            Loading your repositories…
          </p>
        ) : reposQuery.isError ? (
          <ListError
            message={
              reposDisconnected
                ? 'GitHub access is unavailable, so your repositories could not be read.'
                : 'Could not load your repositories.'
            }
            onRetry={() => void reposQuery.refetch()}
          />
        ) : repos.length === 0 ? (
          <p className="text-ink-subtle text-sm">You have no repositories to import.</p>
        ) : (
          <div
            role="radiogroup"
            aria-labelledby="repo-list-heading"
            className="flex flex-col gap-2"
          >
            <h2
              id="repo-list-heading"
              className="text-ink-muted text-xs font-medium tracking-wide uppercase"
            >
              Select a repository to import
            </h2>
            <div className="flex flex-col gap-1.5">
              {repos.map((repo) => (
                <RepoOption
                  key={repo.id}
                  repo={repo}
                  name={`${radioGroupName}-repos`}
                  isSelected={isSelected('repo', repo.fullName)}
                  isDisabled={isDisconnected}
                  onSelect={() =>
                    setSelection({ kind: 'repo', ref: repo.fullName, label: repo.fullName })
                  }
                />
              ))}
            </div>
          </div>
        )}

        <ImportControls
          label="Import repository"
          selection={selection}
          isDisabled={selection === null || startImport.isPending || isDisconnected}
          isPending={startImport.isPending}
          onImport={onImport}
        />
      </SourcePanel>

      {importError !== null && (
        <p
          role="alert"
          className="border-line bg-surface-raised text-ink rounded-md border px-4 py-3 text-sm"
        >
          {importError.message}
        </p>
      )}

      {activeJobId !== null && (
        <SyncJobPanel jobId={activeJobId} onDismiss={() => setActiveJobId(null)} />
      )}
    </div>
  )
}
