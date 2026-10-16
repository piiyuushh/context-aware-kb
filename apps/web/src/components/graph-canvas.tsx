'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { ForceGraphMethods, LinkObject, NodeObject } from 'react-force-graph-2d'

import {
  NODE_TYPE_COLOR,
  nodeRadius,
  truncateLabel,
  type GraphLinkModel,
  type GraphModel,
  type GraphNodeModel,
} from '@/lib/graph-data'
import { useElementSize } from '@/lib/use-element-size'

/**
 * Palette kept in sync with the `@theme` tokens in globals.css. These are raw
 * CSS colours because the canvas API takes strings, not Tailwind classes.
 */
const CANVAS_BACKGROUND = '#0b0f14'
const LABEL_COLOR = '#e7eef7'
const SELECTED_RING = '#e7eef7'
const MATCH_RING = '#7dd3fc'
const EXPLICIT_EDGE = 'rgba(125, 211, 252, 0.55)'
const SUGGESTED_EDGE = 'rgba(123, 141, 163, 0.32)'
/** Non-matching nodes fade this far back while a search is active. */
const DIM_OPACITY = 0.18
/**
 * Labels are the expensive part of a frame, so they are drawn for highlighted
 * nodes always and for everything else only once zoomed in past this scale —
 * at that point only a handful of nodes are on screen anyway.
 */
const LABEL_ZOOM = 1.4
/** Physics that settles quickly: 2000 nodes must not pin a CPU core. */
const WARMUP_TICKS = 20
const COOLDOWN_TICKS = 80
const CHARGE_STRENGTH = -22
const LINK_DISTANCE = 28

/**
 * We draw the node entirely ourselves, so the library should not paint its
 * default circle underneath. Module-level so the identity is stable across the
 * explorer's re-renders (slider drags, search keystrokes).
 */
const NODE_CANVAS_OBJECT_MODE = () => 'replace' as const

type GNode = NodeObject<GraphNodeModel>
type GLink = LinkObject<GraphNodeModel, GraphLinkModel>

export type GraphCanvasProps = {
  data: GraphModel
  /** Id of the node whose detail is open, drawn with a ring. */
  selectedId: string | null
  /** Ids matching the search box, or null when no search is active. */
  matchIds: ReadonlySet<string> | null
  onSelect: (id: string) => void
  /** Fired on a click on empty canvas, to close the detail panel. */
  onClear: () => void
}

/**
 * Canvas force graph. Rendering is declarative accessors only — nothing React
 * re-renders per frame — and the parent must be positioned, since the graph
 * fills it absolutely. The library mutates the node objects we hand it with
 * `x`/`y`/`vx`/`vy`, which is how positions persist between renders.
 */
export function GraphCanvas({ data, selectedId, matchIds, onSelect, onClear }: GraphCanvasProps) {
  const { ref: containerRef, width, height } = useElementSize()
  const graphRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Looser forces than the library defaults: a wide graph reads better when
  // clusters are allowed to spread, and fewer ticks are needed to settle.
  useEffect(() => {
    const graph = graphRef.current
    if (graph === undefined) return
    graph.d3Force('charge')?.strength?.(CHARGE_STRENGTH)
    graph.d3Force('link')?.distance?.(LINK_DISTANCE)
  }, [width, height])

  // Depends on the highlight state so react-kapsule re-applies the accessor and
  // repaints: with `autoPauseRedraw` on, a settled graph would otherwise stay
  // stale until the next pan or zoom.
  const nodeCanvasObject = useCallback(
    (node: GNode, context: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0
      const y = node.y ?? 0
      const radius = nodeRadius(node.degree)
      const isSelected = node.id === selectedId
      const isMatch = matchIds !== null && matchIds.has(node.id)
      const isHovered = node.id === hoveredId
      const isDimmed = matchIds !== null && !isMatch

      context.globalAlpha = isDimmed ? DIM_OPACITY : 1
      context.beginPath()
      context.arc(x, y, radius, 0, Math.PI * 2)
      context.fillStyle = NODE_TYPE_COLOR[node.type]
      context.fill()

      if (isSelected || isHovered || isMatch) {
        context.beginPath()
        context.arc(x, y, radius + 1.5, 0, Math.PI * 2)
        context.lineWidth = isSelected ? 2 : 1.25
        context.strokeStyle = isSelected ? SELECTED_RING : MATCH_RING
        context.stroke()
      }
      context.globalAlpha = 1

      if (isSelected || isHovered || isMatch || globalScale >= LABEL_ZOOM) {
        const fontSize = Math.max(2.5, 11 / globalScale)
        context.font = `${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`
        context.textAlign = 'center'
        context.textBaseline = 'top'
        context.fillStyle = isDimmed ? 'rgba(231, 238, 247, 0.35)' : LABEL_COLOR
        context.fillText(truncateLabel(node.title), x, y + radius + 1)
      }
    },
    [selectedId, matchIds, hoveredId],
  )

  // Pointer targets must match what is drawn, or clicks land on the default
  // (much larger) radius and neighbouring nodes become unreachable.
  const nodePointerAreaPaint = useCallback(
    (node: GNode, paintColor: string, context: CanvasRenderingContext2D) => {
      context.fillStyle = paintColor
      context.beginPath()
      context.arc(node.x ?? 0, node.y ?? 0, nodeRadius(node.degree) + 2, 0, Math.PI * 2)
      context.fill()
    },
    [],
  )

  const linkColor = useCallback(
    (link: GLink) => (link.type === 'explicit' ? EXPLICIT_EDGE : SUGGESTED_EDGE),
    [],
  )
  const linkWidth = useCallback((link: GLink) => (link.type === 'explicit' ? 1.3 : 0.6), [])
  const linkLineDash = useCallback((link: GLink) => (link.type === 'suggested' ? [3, 3] : null), [])
  const linkDirectionalArrowColor = useCallback(() => 'rgba(125, 211, 252, 0.7)', [])
  const linkDirectionalArrowLength = useCallback(
    (link: GLink) => (link.type === 'explicit' ? 3.5 : 0),
    [],
  )

  const handleNodeClick = useCallback((node: GNode) => onSelect(node.id), [onSelect])
  const handleNodeHover = useCallback((node: GNode | null) => setHoveredId(node?.id ?? null), [])

  return (
    <div ref={containerRef} className="absolute inset-0">
      {width > 0 && height > 0 && (
        <ForceGraph2D<GraphNodeModel, GraphLinkModel>
          ref={graphRef}
          graphData={data}
          width={width}
          height={height}
          backgroundColor={CANVAS_BACKGROUND}
          nodeRelSize={4}
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={NODE_CANVAS_OBJECT_MODE}
          nodePointerAreaPaint={nodePointerAreaPaint}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkLineDash={linkLineDash}
          linkDirectionalArrowColor={linkDirectionalArrowColor}
          linkDirectionalArrowLength={linkDirectionalArrowLength}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onBackgroundClick={onClear}
          warmupTicks={WARMUP_TICKS}
          cooldownTicks={COOLDOWN_TICKS}
          d3VelocityDecay={0.35}
        />
      )}

      <button
        type="button"
        onClick={() => graphRef.current?.zoomToFit(400, 60)}
        className="border-line bg-surface/85 text-ink-muted hover:text-ink focus-visible:ring-accent absolute bottom-3 left-3 rounded-md border px-2.5 py-1.5 text-xs backdrop-blur focus-visible:ring-2"
      >
        Fit to view
      </button>
    </div>
  )
}
