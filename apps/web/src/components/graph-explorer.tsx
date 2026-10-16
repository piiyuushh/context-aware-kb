'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MAX_GRAPH_LIMIT, type EdgeType, type NoteType } from '@kb/shared'

import { MarkdownPreview } from '@/components/markdown-preview'
import { NoteTypeBadge } from '@/components/note-type-badge'
import type { GraphFilters } from '@/lib/api-client'
import { buildGraphModel, findMatchingNodeIds, type GraphNodeModel } from '@/lib/graph-data'
import { useGraph, useNote, useTags } from '@/lib/queries'
import { useDebouncedValue } from '@/lib/use-debounced-value'

/**
 * The force-graph library touches `window` on import, so it is loaded on the
 * client only. Keeping it behind `next/dynamic` also lifts it out of the
 * initial bundle for every other route.
 */
const GraphCanvas = dynamic(() => import('@/components/graph-canvas').then((m) => m.GraphCanvas), {
  ssr: false,
  loading: () => (
    <p
      role="status"
      className="text-ink-subtle absolute inset-0 flex items-center justify-center text-sm"
    >
      Loading graph…
    </p>
  ),
})

type TypeFilter = NoteType | 'all'

const TYPE_FILTERS: readonly TypeFilter[] = ['all', 'doc', 'snippet', 'note']
const NODE_TYPES: readonly NoteType[] = ['doc', 'snippet', 'note']
/**
 * DOM counterpart of the canvas's `NODE_TYPE_COLOR`. Static class strings so
 * Tailwind emits them; the canvas needs raw hex, the DOM needs utilities.
 */
const NODE_DOT_CLASS: Record<NoteType, string> = {
  doc: 'bg-accent',
  snippet: 'bg-link',
  note: 'bg-ink-muted',
}
/** Node counts offered in the toolbar; the top one is the API's hard cap. */
const LIMIT_OPTIONS = [250, 500, 1000, MAX_GRAPH_LIMIT] as const
const DEFAULT_LIMIT = 500
/** Quiet period before the score slider re-queries, so dragging is one request. */
const SCORE_DEBOUNCE_MS = 150
/** The side list is capped so a 2000-node graph does not render 2000 buttons. */
const NODE_LIST_LIMIT = 200

function typeFilterClass(isActive: boolean): string {
  return `focus-visible:ring-accent rounded-full border px-2.5 py-1 text-xs focus-visible:ring-2 ${
    isActive
      ? 'border-accent bg-accent/15 text-accent font-semibold'
      : 'border-line bg-surface-raised text-ink-muted hover:text-ink'
  }`
}

const EDGE_LEGEND: readonly { type: EdgeType; label: string }[] = [
  { type: 'explicit', label: 'Wiki link' },
  { type: 'suggested', label: 'Suggested' },
]

/** Colour key for node kinds and edge styles, drawn over the canvas. */
function GraphLegend() {
  return (
    <div className="border-line bg-surface/85 absolute top-3 right-3 flex flex-col gap-1.5 rounded-md border px-3 py-2 text-xs backdrop-blur">
      {NODE_TYPES.map((type) => (
        <span key={type} className="flex items-center gap-2">
          <span aria-hidden="true" className={`size-2.5 rounded-full ${NODE_DOT_CLASS[type]}`} />
          <span className="text-ink-muted capitalize">{type}</span>
        </span>
      ))}
      {EDGE_LEGEND.map(({ type, label }) => (
        <span key={type} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`w-6 border-t-2 ${
              type === 'explicit' ? 'border-accent' : 'border-ink-subtle border-dashed'
            }`}
          />
          <span className="text-ink-muted">{label}</span>
        </span>
      ))}
    </div>
  )
}

/** One row in the connection list: direction, kind, title and confidence. */
function ConnectionRow({
  node,
  type,
  score,
  onSelect,
}: {
  node: GraphNodeModel
  type: EdgeType
  score: number | null
  onSelect: (id: string) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className="focus-visible:ring-accent hover:bg-surface-raised flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left focus-visible:ring-2"
      >
        <span
          aria-hidden="true"
          className={`size-2 shrink-0 rounded-full ${NODE_DOT_CLASS[node.type]}`}
        />
        <span className="text-ink min-w-0 flex-1 truncate text-sm">{node.title}</span>
        <span className="text-ink-subtle shrink-0 text-[0.7rem] tracking-wide uppercase">
          {type === 'explicit' ? 'link' : 'suggested'}
        </span>
        {score !== null && (
          <span className="text-ink-subtle shrink-0 text-xs tabular-nums">{score.toFixed(2)}</span>
        )}
      </button>
    </li>
  )
}

/**
 * `/graph`: a filterable force-directed map of the knowledge base. Filters and
 * the search box narrow the canvas; clicking a node opens its detail in the
 * side panel. Nothing about the layout lives in React state — the force
 * simulation owns node positions — so panning, zooming and hovering never
 * re-render the tree.
 */
export function GraphExplorer() {
  const [activeType, setActiveType] = useState<TypeFilter>('all')
  const [activeTag, setActiveTag] = useState('')
  const [minScore, setMinScore] = useState(0)
  const [limit, setLimit] = useState<number>(DEFAULT_LIMIT)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const debouncedMinScore = useDebouncedValue(minScore, SCORE_DEBOUNCE_MS)

  const filters = useMemo<GraphFilters>(
    () => ({
      type: activeType === 'all' ? undefined : activeType,
      tag: activeTag.length > 0 ? activeTag : undefined,
      minScore: debouncedMinScore,
      limit,
    }),
    [activeType, activeTag, debouncedMinScore, limit],
  )

  const graphQuery = useGraph(filters)
  const tagsQuery = useTags()

  const model = useMemo(
    () => buildGraphModel(graphQuery.data ?? { nodes: [], edges: [] }),
    [graphQuery.data],
  )
  const matchIds = useMemo(() => findMatchingNodeIds(model.nodes, search), [model.nodes, search])

  const selectedNode = useMemo(
    () => model.nodes.find((node) => node.id === selectedId) ?? null,
    [model.nodes, selectedId],
  )
  const noteQuery = useNote(selectedId ?? '')

  // The selected note can disappear when a filter changes; drop the selection
  // rather than render a detail panel for a node that is no longer on screen.
  useEffect(() => {
    if (selectedId !== null && !model.nodes.some((node) => node.id === selectedId)) {
      setSelectedId(null)
    }
  }, [selectedId, model.nodes])

  useEffect(() => {
    if (selectedId === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId])

  const handleSelect = useCallback((id: string) => setSelectedId(id), [])
  const handleClear = useCallback(() => setSelectedId(null), [])

  /** Edges incident to the selected node, with the neighbour and direction. */
  const connections = useMemo(() => {
    if (selectedNode === null) return []
    const byId = new Map(model.nodes.map((node) => [node.id, node]))
    return model.links.flatMap((link) => {
      const otherId =
        link.source === selectedNode.id
          ? link.target
          : link.target === selectedNode.id
            ? link.source
            : null
      const other = otherId === null ? undefined : byId.get(otherId)
      return other === undefined ? [] : [{ node: other, type: link.type, score: link.score }]
    })
  }, [model, selectedNode])

  const listedNodes = useMemo(() => {
    const nodes =
      matchIds === null ? model.nodes : model.nodes.filter((node) => matchIds.has(node.id))
    return nodes.slice(0, NODE_LIST_LIMIT)
  }, [model.nodes, matchIds])

  const isEmpty = graphQuery.data !== undefined && model.nodes.length === 0

  return (
    <div className="flex min-h-0 flex-col lg:h-screen">
      <header className="border-line bg-surface flex flex-col gap-3 border-b p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Knowledge graph</h1>
          <p className="text-ink-subtle text-xs tabular-nums">
            {model.nodes.length} notes · {model.links.length} links
            {matchIds !== null && ` · ${matchIds.size} matching “${search.trim()}”`}
          </p>
          {graphQuery.isFetching && (
            <span role="status" className="text-ink-subtle text-xs">
              Updating…
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div
            role="group"
            aria-label="Filter by note type"
            className="flex flex-wrap items-center gap-1.5"
          >
            {TYPE_FILTERS.map((value) => {
              const isActive = value === activeType
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveType(value)}
                  className={typeFilterClass(isActive)}
                >
                  {value === 'all' ? 'All' : <NoteTypeBadge type={value} />}
                </button>
              )
            })}
          </div>

          <label className="flex items-center gap-2 text-xs">
            <span className="text-ink-subtle">Tag</span>
            <select
              value={activeTag}
              onChange={(event) => setActiveTag(event.target.value)}
              className="border-line bg-surface-raised text-ink focus-visible:ring-accent rounded-md border px-2 py-1 text-xs focus-visible:ring-2"
            >
              <option value="">All tags</option>
              {(tagsQuery.data ?? []).map((tag) => (
                <option key={tag.id} value={tag.name}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs">
            <span className="text-ink-subtle">Min score</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={minScore}
              onChange={(event) => setMinScore(Number(event.target.value))}
              className="accent-accent w-28"
            />
            <span className="text-ink-muted w-8 text-right tabular-nums">
              {minScore.toFixed(2)}
            </span>
          </label>

          <label className="flex items-center gap-2 text-xs">
            <span className="text-ink-subtle">Nodes</span>
            <select
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="border-line bg-surface-raised text-ink focus-visible:ring-accent rounded-md border px-2 py-1 text-xs focus-visible:ring-2"
            >
              {LIMIT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <input
            type="search"
            aria-label="Highlight notes by title"
            placeholder="Highlight notes…"
            autoComplete="off"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="border-line bg-surface-raised text-ink placeholder:text-ink-subtle focus-visible:ring-accent ml-auto w-full max-w-xs rounded-md border px-3 py-1.5 text-sm focus-visible:ring-2"
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative h-[60vh] w-full lg:h-auto lg:min-h-0 lg:flex-1">
          <GraphCanvas
            data={model}
            selectedId={selectedId}
            matchIds={matchIds}
            onSelect={handleSelect}
            onClear={handleClear}
          />

          <GraphLegend />

          {graphQuery.isError && (
            <div
              role="alert"
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center"
            >
              <p className="text-ink text-sm">Could not load the graph.</p>
              <p className="text-ink-subtle text-xs">
                Check that the API is running, then try again.
              </p>
              <button
                type="button"
                onClick={() => void graphQuery.refetch()}
                className="border-line-strong bg-surface-raised text-ink focus-visible:ring-accent rounded-md border px-2.5 py-1 text-xs focus-visible:ring-2"
              >
                Try again
              </button>
            </div>
          )}

          {isEmpty && !graphQuery.isError && (
            <p className="text-ink-subtle absolute inset-0 flex items-center justify-center text-sm">
              No notes match these filters.
            </p>
          )}
        </div>

        <aside
          aria-label="Note details"
          className="border-line bg-surface flex w-full shrink-0 flex-col border-t lg:h-full lg:w-80 lg:overflow-y-auto lg:border-t-0 lg:border-l"
        >
          {selectedNode !== null ? (
            <div className="flex flex-col gap-4 p-4">
              <div className="flex items-start gap-2">
                <h2 className="text-ink min-w-0 flex-1 text-base font-semibold tracking-tight">
                  {selectedNode.title}
                </h2>
                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="Close note details"
                  className="border-line bg-surface-raised text-ink-muted hover:text-ink focus-visible:ring-accent rounded-md border px-2 py-1 text-xs focus-visible:ring-2"
                >
                  Close
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <NoteTypeBadge type={selectedNode.type} />
                {selectedNode.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="border-line bg-surface-raised text-ink-muted rounded-full border px-2 py-0.5 text-xs"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>

              <Link
                href={`/notes/${selectedNode.id}`}
                className="text-link text-sm font-medium underline underline-offset-2"
              >
                Open note →
              </Link>

              <section className="flex flex-col gap-1">
                <h3 className="text-ink-muted text-xs font-semibold tracking-wide uppercase">
                  Connections ({connections.length})
                </h3>
                {connections.length === 0 ? (
                  <p className="text-ink-subtle text-sm">No links in this view.</p>
                ) : (
                  <ul className="flex flex-col gap-0.5">
                    {connections.map((connection) => (
                      <ConnectionRow
                        key={`${connection.node.id}-${connection.type}`}
                        node={connection.node}
                        type={connection.type}
                        score={connection.score}
                        onSelect={handleSelect}
                      />
                    ))}
                  </ul>
                )}
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-ink-muted text-xs font-semibold tracking-wide uppercase">
                  Preview
                </h3>
                {noteQuery.isPending ? (
                  <p role="status" className="text-ink-subtle text-sm">
                    Loading…
                  </p>
                ) : noteQuery.isError ? (
                  <p className="text-ink-subtle text-sm">Could not load this note.</p>
                ) : (
                  <MarkdownPreview content={noteQuery.data?.contentMd ?? ''} />
                )}
              </section>
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-4">
              <h2 className="text-ink-muted text-xs font-semibold tracking-wide uppercase">
                {matchIds === null ? 'Notes in view' : 'Matches'} (
                {matchIds?.size ?? model.nodes.length})
              </h2>
              {listedNodes.length === 0 ? (
                <p className="text-ink-subtle text-sm">No notes match this view.</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-0.5">
                    {listedNodes.map((node) => (
                      <li key={node.id}>
                        <button
                          type="button"
                          onClick={() => handleSelect(node.id)}
                          className="focus-visible:ring-accent hover:bg-surface-raised flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left focus-visible:ring-2"
                        >
                          <span
                            aria-hidden="true"
                            className={`size-2.5 shrink-0 rounded-full ${NODE_DOT_CLASS[node.type]}`}
                          />
                          <span className="text-ink min-w-0 flex-1 truncate text-sm">
                            {node.title}
                          </span>
                          <NoteTypeBadge type={node.type} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {listedNodes.length < (matchIds?.size ?? model.nodes.length) && (
                    <p className="text-ink-subtle text-xs">
                      Showing the first {NODE_LIST_LIMIT}. Use the highlight box to narrow the list.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
