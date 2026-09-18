/**
 * The dependency-graph panel: fetch, stats, the drawing, the detail, the problems.
 *
 * Read-only by design: the graph answers "who needs whom", and nothing here is a
 * control. It is DRAWN (see ./graph-canvas.tsx) rather than listed, because the
 * question is structural — which few services hold the whole composition
 * together — and a list answers that one row at a time, at the cost of the shape.
 *
 * The two halves split the work: the drawing says WHICH node, the detail panel
 * says which service, in which direction, and whether the declaration gates
 * activation. Neither replaces the other.
 *
 * This module is the PANEL, not a host. Two hosts render it: the in-app settings
 * section (./index.ts, mounted through the slot renderer) and the standalone page
 * (../viewer/main.tsx, served whole by the Node half). The one thing they
 * disagree about is the "open in a new tab" button, which is what `viewerPath`
 * selects — the viewer does not link to itself.
 *
 * The graph is fetched rather than pushed: it is a JSON snapshot with no delta
 * contract worth owning, and a panel that reads it on mount is always current
 * when opened.
 */
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  GRAPH_PATH,
  type GraphEdge, type GraphInjection, type GraphNode, type PluginGraph,
} from '../graph-types.ts'
import { GraphCanvas } from './graph-canvas.tsx'
import type { Translate } from './locales.ts'

/** Which runtime's tree is on screen. */
type Scope = 'host' | 'client'

/** Props the two hosts bind for this panel. */
export interface GraphPanelProps {
  /** Locale-bound translate. */
  readonly t: Translate
  /** Path of the standalone viewer, or null to omit the button that opens it. */
  readonly viewerPath: string | null
  /**
   * Collect the BROWSER half's graph, or undefined where there is no browser tree.
   *
   * The two trees are separate on purpose and must never be merged: they are
   * different Cordis runtimes with different plugins and different service names,
   * so one merged graph would not be a bigger one, it would be a wrong one. That
   * is why this is a second SOURCE rather than a second set of nodes.
   *
   * Absent in the standalone viewer: that page is served by the Node half and has
   * no client Cordis of its own, so it can only show the host's graph.
   */
  readonly clientGraph?: () => PluginGraph
  /**
   * Height of the drawing area in px, or undefined for the canvas's own default.
   * The viewer sizes it to the window; a settings column wants a fixed panel.
   */
  readonly canvasHeight?: number
}

/** What the panel is currently showing. */
type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly graph: PluginGraph }

export function GraphPanel({ t, viewerPath, clientGraph, canvasHeight }: GraphPanelProps): ReactNode {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [selected, setSelected] = useState<string | null>(null)
  const [scope, setScope] = useState<Scope>('host')

  const refresh = useCallback((): void => {
    setLoad({ kind: 'loading' })
    void (async () => {
      try {
        // Whichever half has the tree assembles it, and both call the same
        // `collectGraph`: the host's is FETCHED because the browser cannot see
        // that runtime, and the browser's is COLLECTED here because the host
        // cannot see this one.
        const graph = scope === 'client' && clientGraph !== undefined
          ? clientGraph()
          : await fetch(GRAPH_PATH, { cache: 'no-store' }).then(async (response) => {
            if (!response.ok) throw new Error(`plugin graph: HTTP ${String(response.status)}`)
            return (await response.json()) as PluginGraph
          })
        setLoad({ kind: 'ready', graph })
      } catch {
        // The route is registered by the Node half; a failure here means it is not
        // mounted, and the section says so rather than showing an empty graph —
        // "no plugins" and "cannot ask" are different answers.
        setLoad({ kind: 'failed' })
      }
    })()
    // Re-reads when the scope changes, because `refresh` is that scope's read.
  }, [scope, clientGraph])

  useEffect(() => { refresh() }, [refresh])

  return (
    <div style={ROOT_STYLE}>
      <div style={HEADER_STYLE}>
        <h2 style={HEADING_STYLE}>{t('title')}</h2>
        <div style={HEADER_ACTIONS_STYLE}>
          {/* Only where there are two trees to choose between. The two buttons
              sit together because they are one choice — the viewer, which has
              only the host's graph, shows neither. */}
          {clientGraph !== undefined && (
            <>
              <button
                type="button"
                aria-pressed={scope === 'host'}
                style={SCOPE_STYLE(scope === 'host')}
                onClick={() => { setScope('host') }}
              >
                {t('scopeHost')}
              </button>
              <button
                type="button"
                aria-pressed={scope === 'client'}
                style={SCOPE_STYLE(scope === 'client')}
                onClick={() => { setScope('client') }}
              >
                {t('scopeClient')}
              </button>
            </>
          )}
          {viewerPath !== null && (
            <button
              type="button"
              style={REFRESH_STYLE}
              // `noopener`: same-origin, but a fresh document has no business
              // reaching back through `window.opener`.
              onClick={() => { window.open(viewerPath, '_blank', 'noopener') }}
            >
              {t('openInTab')}
            </button>
          )}
          <button type="button" style={REFRESH_STYLE} onClick={refresh}>{t('refresh')}</button>
        </div>
      </div>
      <p style={INTRO_STYLE}>{scope === 'client' ? t('introClient') : t('intro')}</p>
      {load.kind === 'loading' && <p style={MUTED_STYLE}>{t('loading')}</p>}
      {load.kind === 'failed' && <p style={FAILED_STYLE}>{t('failed')}</p>}
      {load.kind === 'ready' && (
        <Ready
          graph={load.graph}
          selected={selected}
          onSelect={setSelected}
          t={t}
          canvasHeight={canvasHeight}
        />
      )}
    </div>
  )
}

/** The loaded view: stats, the drawing with its detail panel, and the problems. */
function Ready({ graph, selected, onSelect, t, canvasHeight }: {
  readonly graph: PluginGraph
  readonly selected: string | null
  readonly onSelect: (id: string) => void
  readonly t: Translate
  readonly canvasHeight?: number
}): ReactNode {
  const node = graph.nodes.find(candidate => candidate.id === selected) ?? null
  return (
    <>
      <div style={STATS_STYLE}>
        <Chip text={t('statPlugins', { value: graph.nodes.length })} />
        <Chip text={t('statEdges', { value: graph.edges.length })} />
        {graph.unresolved.length > 0 && (
          <Chip text={t('statUnresolved', { value: graph.unresolved.length })} warn />
        )}
      </div>
      <div style={COLUMNS_STYLE}>
        <section style={CANVAS_COLUMN_STYLE}>
          <h3 style={SUBHEADING_STYLE}>{t('sectionGraph')}</h3>
          <GraphCanvas
            graph={graph}
            selected={selected}
            onSelect={onSelect}
            t={t}
            height={canvasHeight}
          />
        </section>
        <section style={COLUMN_STYLE}>
          <h3 style={SUBHEADING_STYLE}>{t('sectionDetail')}</h3>
          {node === null
            ? <p style={MUTED_STYLE}>{t('selectHint')}</p>
            : <Detail graph={graph} node={node} onSelect={onSelect} t={t} />}
        </section>
      </div>
      <Problems graph={graph} t={t} />
    </>
  )
}

function Chip({ text, warn = false }: { readonly text: string; readonly warn?: boolean }): ReactNode {
  return <span style={warn ? CHIP_WARN_STYLE : CHIP_STYLE}>{text}</span>
}

/** One plugin's services and its edges in both directions. */
function Detail({ graph, node, onSelect, t }: {
  readonly graph: PluginGraph
  readonly node: GraphNode
  readonly onSelect: (id: string) => void
  readonly t: Translate
}): ReactNode {
  const byId = new Map(graph.nodes.map(candidate => [candidate.id, candidate]))
  // The two declaration styles are listed apart rather than mixed with a marker
  // on each tag: they answer different questions, and a reader asking "why did
  // this plugin not load" wants only the first list.
  const runtime = injectedServices(node.injects, true)
  // Edges are directed consumer → provider, so "what I depend on" is the outgoing
  // side and "what depends on me" is the incoming one. Both are shown because a
  // hub plugin is interesting for the second and a misbehaving one for the first.
  return (
    <div>
      <div style={DETAIL_HEAD_STYLE}>
        <span style={DETAIL_NAME_STYLE}>{node.name}</span>
        <span style={DETAIL_ID_STYLE}>{node.id} · {stateLabel(node.state, t)}</span>
      </div>
      <ServiceList title={t('provides')} empty={t('nothingProvides')} values={node.provides} />
      <ServiceList
        title={t('injects')}
        empty={t('nothingInjects')}
        values={injectedServices(node.injects, false)}
      />
      {/* Always present when there is something to say, rather than a permanent
          empty block: most plugins never acquire anything at runtime. */}
      {runtime.length > 0 && (
        <ServiceList
          title={t('injectsOptional')}
          empty={t('nothingInjectsOptional')}
          values={runtime}
        />
      )}
      <EdgeList
        title={t('dependsOn')}
        empty={t('noDependsOn')}
        edges={graph.edges.filter(edge => edge.from === node.id)}
        side="to"
        byId={byId}
        onSelect={onSelect}
        optionalLabel={t('optionalMark')}
      />
      <EdgeList
        title={t('usedBy')}
        empty={t('noUsedBy')}
        edges={graph.edges.filter(edge => edge.to === node.id)}
        side="from"
        byId={byId}
        onSelect={onSelect}
        optionalLabel={t('optionalMark')}
      />
    </div>
  )
}

/**
 * Names of the injections on one side of the required / runtime split.
 * @param injections - one node's injection list.
 * @param optional - which side to select.
 * @returns the matching service names, in declaration order.
 */
function injectedServices(injections: readonly GraphInjection[], optional: boolean): string[] {
  return injections
    .filter(injection => injection.optional === optional)
    .map(injection => injection.service)
}

/** A plain list of service names. */
function ServiceList({ title, empty, values }: {
  readonly title: string
  readonly empty: string
  readonly values: readonly string[]
}): ReactNode {
  return (
    <div style={BLOCK_STYLE}>
      <div style={BLOCK_TITLE_STYLE}>{title}</div>
      {values.length === 0
        ? <div style={MUTED_SMALL_STYLE}>{empty}</div>
        : (
          <div style={TAGS_STYLE}>
            {values.map(value => <span key={value} style={TAG_STYLE}>{value}</span>)}
          </div>
        )}
    </div>
  )
}

/** Adjacent plugins, each row naming the service that makes the edge. */
function EdgeList({ title, empty, edges, side, byId, onSelect, optionalLabel }: {
  readonly title: string
  readonly empty: string
  readonly edges: readonly GraphEdge[]
  readonly side: 'from' | 'to'
  readonly byId: ReadonlyMap<string, GraphNode>
  readonly onSelect: (id: string) => void
  /** Badge shown on a runtime-acquired edge; absent on a declared one. */
  readonly optionalLabel: string
}): ReactNode {
  return (
    <div style={BLOCK_STYLE}>
      <div style={BLOCK_TITLE_STYLE}>{title}</div>
      {edges.length === 0
        ? <div style={MUTED_SMALL_STYLE}>{empty}</div>
        : (
          <ul style={PLAIN_LIST_STYLE}>
            {edges.map(edge => {
              const otherId = side === 'to' ? edge.to : edge.from
              return (
                <li key={`${edge.from}|${edge.to}|${edge.service}`}>
                  <button type="button" style={EDGE_ROW_STYLE} onClick={() => { onSelect(otherId) }}>
                    <span style={EDGE_SERVICE_STYLE}>{edge.service}</span>
                    {edge.optional && <span style={OPTIONAL_MARK_STYLE}>{optionalLabel}</span>}
                    <span style={EDGE_ARROW_STYLE}>{side === 'to' ? '→' : '←'}</span>
                    <span style={EDGE_NAME_STYLE}>{byId.get(otherId)?.name ?? otherId}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
    </div>
  )
}

/** The two things a reader may need to act on. */
function Problems({ graph, t }: {
  readonly graph: PluginGraph
  readonly t: Translate
}): ReactNode {
  return (
    <div style={BLOCK_STYLE}>
      <div style={BLOCK_TITLE_STYLE}>{t('unresolvedTitle')}</div>
      {graph.unresolved.length === 0
        ? <div style={MUTED_SMALL_STYLE}>{t('unresolvedNone')}</div>
        : (
          <ul style={PLAIN_LIST_STYLE}>
            {graph.unresolved.map(item => (
              <li key={`${item.from}|${item.service}`} style={PROBLEM_ROW_STYLE}>
                <span style={EDGE_SERVICE_STYLE}>{item.service}</span>
                <span style={EDGE_ARROW_STYLE}>←</span>
                <span style={EDGE_NAME_STYLE}>{item.from}</span>
              </li>
            ))}
          </ul>
        )}
      <div style={{ ...BLOCK_TITLE_STYLE, marginTop: 12 }}>{t('isolatedTitle')}</div>
      {graph.isolated.length === 0
        ? <div style={MUTED_SMALL_STYLE}>{t('isolatedNone')}</div>
        : (
          <ul style={PLAIN_LIST_STYLE}>
            {graph.isolated.map(item => (
              <li key={item.service} style={PROBLEM_ROW_STYLE}>
                <span style={EDGE_SERVICE_STYLE}>{item.service}</span>
                <span style={EDGE_ARROW_STYLE}>×{item.providers.length}</span>
                <span style={EDGE_NAME_STYLE}>{item.providers.join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}

/** Human label for a fiber state; anything not active or failed is "not loaded". */
function stateLabel(state: string, t: Translate): string {
  if (state === 'active') return t('stateActive')
  if (state === 'failed') return t('stateFailed')
  return t('stateOther')
}

// --- Styles ---------------------------------------------------------------

/** The scope pair: the active one inverts, so the pair reads as one control. */
function SCOPE_STYLE(active: boolean): CSSProperties {
  return {
    ...REFRESH_STYLE,
    ...(active
      ? {
        background: 'var(--dsw-alias-label-primary)',
        color: 'var(--dsw-alias-bg-layer-2)',
        borderColor: 'transparent',
      }
      : {}),
  }
}

const ROOT_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  fontSize: 13,
  color: 'var(--dsw-alias-label-primary)',
}

const HEADER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const HEADING_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
}

const INTRO_STYLE: CSSProperties = {
  margin: 0,
  color: 'var(--dsw-alias-label-secondary)',
}

const HEADER_ACTIONS_STYLE: CSSProperties = {
  display: 'flex',
  flex: 'none',
  gap: 6,
}

const REFRESH_STYLE: CSSProperties = {
  flex: 'none',
  padding: '4px 12px',
  border: 'none',
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-layer-2)',
  color: 'var(--dsw-alias-label-secondary)',
  font: 'inherit',
  fontSize: 12,
  cursor: 'pointer',
}

const MUTED_STYLE: CSSProperties = {
  margin: 0,
  padding: '16px 0',
  color: 'var(--dsw-alias-label-tertiary)',
}

const FAILED_STYLE: CSSProperties = {
  margin: 0,
  padding: '16px 0',
  color: 'var(--dsw-alias-state-error-primary)',
}

const MUTED_SMALL_STYLE: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 12,
}

const STATS_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}

const CHIP_STYLE: CSSProperties = {
  padding: '2px 8px',
  borderRadius: 999,
  background: 'var(--dsw-alias-bg-layer-2)',
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 12,
  fontVariantNumeric: 'tabular-nums',
}

const CHIP_WARN_STYLE: CSSProperties = {
  ...CHIP_STYLE,
  color: 'var(--dsw-alias-state-error-primary)',
}

const COLUMNS_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 16,
  alignItems: 'flex-start',
}

/**
 * The drawing's column is the wider of the two: the layout is what the reader
 * came for, and the detail panel reads fine at its minimum width.
 */
const CANVAS_COLUMN_STYLE: CSSProperties = {
  flex: '2 1 460px',
  minWidth: 320,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const COLUMN_STYLE: CSSProperties = {
  flex: '1 1 300px',
  minWidth: 260,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const SUBHEADING_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--dsw-alias-label-secondary)',
}

const DETAIL_HEAD_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  flexWrap: 'wrap',
  gap: 8,
  marginBottom: 10,
}

const DETAIL_NAME_STYLE: CSSProperties = {
  fontWeight: 600,
}

const DETAIL_ID_STYLE: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 12,
}

const BLOCK_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginTop: 10,
}

const BLOCK_TITLE_STYLE: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--dsw-alias-label-secondary)',
}

const TAGS_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
}

const TAG_STYLE: CSSProperties = {
  padding: '1px 6px',
  borderRadius: 5,
  background: 'var(--dsw-alias-bg-layer-2)',
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 12,
}

const PLAIN_LIST_STYLE: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const EDGE_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  width: '100%',
  padding: '3px 6px',
  border: 'none',
  borderRadius: 5,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  fontSize: 12,
  textAlign: 'start',
  cursor: 'pointer',
}

const PROBLEM_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  padding: '3px 6px',
  fontSize: 12,
}

const EDGE_SERVICE_STYLE: CSSProperties = {
  flex: 'none',
  color: 'var(--dsw-alias-label-secondary)',
}

/** Badge marking an edge the plugin only takes at runtime. */
const OPTIONAL_MARK_STYLE: CSSProperties = {
  flex: 'none',
  padding: '0 6px',
  borderRadius: 5,
  background: 'var(--dsw-alias-bg-layer-2)',
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 11,
}

const EDGE_ARROW_STYLE: CSSProperties = {
  flex: 'none',
  color: 'var(--dsw-alias-label-tertiary)',
}

const EDGE_NAME_STYLE: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
