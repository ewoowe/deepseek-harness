/**
 * The live view: what this session is doing right now.
 *
 * Three panes, one window. Context occupancy and the session's wall-time split
 * come from the session's projections — Host-computed over the whole log, so
 * paging history in cannot move them. The step list and the event stream come
 * from the session's own event window, because no projection carries a step, a
 * tool or an event dimension.
 *
 * ## Why the pane updates the way it does
 *
 * The event window is an observable (`SessionEventSource`), so an arriving event
 * re-renders this pane at once — that is what makes it live rather than polled,
 * and it is the half that matters when a turn is actually running.
 *
 * The one-second tick beside it is NOT a coarser version of the same thing. It
 * covers exactly two facts the window cannot deliver:
 *
 * 1. **The projections have no subscription.** Their face exposes only
 *    `getSnapshot`, so a change the Host pushes is invisible until something
 *    re-reads it.
 * 2. **A step waiting on a model emits nothing.** Between `step/start` and the
 *    first token there are no events at all, so an elapsed time derived from the
 *    window would sit frozen on screen while being wrong by a growing amount.
 *
 * `snapshot()` returns the SAME object while nothing moved, so a tick over an
 * idle session costs one comparison and React bails out of the render entirely.
 */
import { useEffect, useReducer, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS, type MessagesKey } from './locales.ts'
import {
  formatCompactDuration, formatCompactTokens, type ContextOccupancy, type LiveTotals,
} from './live-projection.ts'
import type { StepFacts, StreamLine, ToolCallFacts, TurnLive } from './live-facts.ts'

/** How often the pane re-reads figures the event window does not carry. */
const TICK_MS = 1_000

/** How many steps and stream lines to draw. A live pane is a window, not a log. */
const MAX_STEPS = 40
const MAX_STREAM = 60

/** One collection of everything the pane draws, stable while nothing moved. */
export interface LiveSnapshot {
  /** The window revision this was folded at; also the fold's own memo key. */
  readonly revision: number
  /** Every turn the window carries, oldest first. */
  readonly turns: readonly TurnLive[]
  /** Context occupancy, or null when the host serves no pressure projection. */
  readonly occupancy: ContextOccupancy | null
  /** Session totals, or null when neither projection is served. */
  readonly totals: LiveTotals | null
  /** Whether older history remains that the window has not materialised. */
  readonly hasMore: boolean
  /** The newest events, newest first. */
  readonly stream: readonly StreamLine[]
}

/** The face this plugin injects into its own view registration. */
export interface LiveViewInjected {
  /** The session this view is showing. */
  readonly sessionId: string
  /** Subscribe to event-window publication. */
  readonly subscribe: (listener: () => void) => () => void
  /** The current snapshot; the SAME object while nothing moved. */
  readonly snapshot: () => LiveSnapshot
  /** Whether the session holds older events this window has not materialised. */
  readonly hasOlder: () => boolean
  /** Pull the REST of the session in, in one call. */
  readonly loadAll: () => Promise<void>
  /**
   * Make the composer inert with a reason, or clear it.
   *
   * A single slot several plugins raise reasons in, so this view raises its own
   * on the way in and clears it on the way out.
   */
  readonly blockComposer: (reason: string | null) => void
}

/** Full view props, as the registration supplies them. */
export type LiveViewProps =
  PropsRuntime<'conversation.view'> & PropsLocale<typeof NS> & LiveViewInjected

/**
 * Follow the session's event window and its projections.
 * @param subscribe - event-window publication.
 * @param snapshot - the current snapshot, identity-stable while nothing moved.
 * @returns the latest snapshot.
 */
function useLive(
  subscribe: (listener: () => void) => () => void,
  snapshot: () => LiveSnapshot,
): LiveSnapshot {
  const [live, setLive] = useState(snapshot)
  useEffect(() => {
    const publish = (): void => { setLive(snapshot()) }
    // Immediate: an event lands and the pane updates on the spot.
    const offWindow = subscribe(publish)
    // Periodic: the projections and the running clocks; see the module doc.
    const timer = window.setInterval(publish, TICK_MS)
    // The window may have moved between the first render and this effect.
    publish()
    return () => {
      offWindow()
      window.clearInterval(timer)
    }
  }, [subscribe, snapshot])
  return live
}

export function LiveView({
  subscribe, snapshot, hasOlder, loadAll, blockComposer, t,
}: LiveViewProps): ReactNode {
  const live = useLive(subscribe, snapshot)
  const root = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  // Re-read on every render: the tick above guarantees one per second, so a
  // running step's clock advances without a second timer of its own.
  const now = Date.now()

  // Nothing here can be typed into, so the composer is made inert rather than
  // left inviting a message this view cannot show.
  useEffect(() => {
    blockComposer(t('composerBlocked'))
    return () => { blockComposer(null) }
  }, [blockComposer, t])

  // Newest first: a live pane whose newest step is off-screen is not live.
  const steps: Array<{ readonly turn: TurnLive; readonly step: StepFacts }> = []
  for (let index = live.turns.length - 1; index >= 0; index -= 1) {
    const turn = live.turns[index]
    if (turn === undefined) continue
    for (let inside = turn.steps.length - 1; inside >= 0; inside -= 1) {
      const step = turn.steps[inside]
      if (step !== undefined) steps.push({ turn, step })
    }
  }
  const shownSteps = steps.slice(0, MAX_STEPS)

  return (
    <div ref={root} style={ROOT_STYLE} data-conversation-composer-overlay="">
      {live.occupancy !== null && <ContextBar occupancy={live.occupancy} t={t} />}
      {live.totals !== null && <TotalsRow totals={live.totals} t={t} />}
      <h3 style={HEADING_STYLE}>{t('stepsTitle')}</h3>
      {shownSteps.length === 0
        ? <div style={EMPTY_STYLE}>{t('empty')}</div>
        : (
          <div style={LIST_STYLE}>
            {shownSteps.map(({ turn, step }) => (
              <StepRow key={`${String(turn.seq)}:${String(step.seq)}`} turn={turn} step={step} now={now} t={t} />
            ))}
          </div>
        )}
      {live.hasMore && (
        <button
          type="button"
          disabled={loading}
          style={LOAD_STYLE(loading)}
          onClick={() => {
            setLoading(true)
            void loadAll().catch(() => undefined).finally(() => { setLoading(false) })
          }}
        >
          {loading ? t('loading') : t('loadAll')}
        </button>
      )}
      <h3 style={HEADING_STYLE}>{t('streamTitle')}</h3>
      {live.stream.length === 0
        ? <div style={EMPTY_STYLE}>{t('streamEmpty')}</div>
        : (
          <div style={LIST_STYLE}>
            {live.stream.map(line => <StreamRow key={line.key} line={line} />)}
          </div>
        )}
    </div>
  )
}

/** This plugin's translate seat. */
type LiveTranslate = (key: MessagesKey, params?: Record<string, unknown>) => string

/**
 * The context bar: how full the window is, and what the next request carries.
 *
 * The bar tracks the PROJECTED figure, not the raw sample: the sample is what a
 * previous request saw, and drawing it as "where we are" would show a bar that
 * has already moved. The raw number is still printed beside it when the two
 * differ, because the gap between them is the surface the last turn added.
 */
function ContextBar({ occupancy, t }: {
  readonly occupancy: ContextOccupancy
  readonly t: LiveTranslate
}): ReactNode {
  const used = occupancy.projectedTokens ?? occupancy.pressureTokens
  const percent = occupancy.fraction === null ? null : Math.round(occupancy.fraction * 100)
  const grew = occupancy.projectedTokens !== null
    && occupancy.pressureTokens !== null
    && occupancy.projectedTokens !== occupancy.pressureTokens
  return (
    <div style={BAR_STYLE}>
      <div style={BAR_HEAD_STYLE}>
        <span style={BAR_LABEL_STYLE}>{t('contextTitle')}</span>
        <span style={BAR_VALUE_STYLE}>
          {used === null
            ? t('contextNoWindow')
            : occupancy.contextWindow === null
              ? formatCompactTokens(used, t)
              : t('contextOfWindow', {
                used: formatCompactTokens(used, t),
                total: formatCompactTokens(occupancy.contextWindow, t),
              })}
          {percent === null ? null : ` · ${String(percent)}%`}
        </span>
      </div>
      <div style={BAR_TRACK_STYLE}>
        <div style={BAR_FILL_STYLE(occupancy.fraction ?? 0)} />
      </div>
      {grew && occupancy.projectedTokens !== null && (
        <div style={BAR_HINT_STYLE}>
          {t('contextProjected', { value: formatCompactTokens(occupancy.projectedTokens, t) })}
        </div>
      )}
    </div>
  )
}

/** The session's wall-time split and totals, as the Host folded them. */
function TotalsRow({ totals, t }: {
  readonly totals: LiveTotals
  readonly t: LiveTranslate
}): ReactNode {
  return (
    <div style={TOTALS_STYLE}>
      <span style={CHIP_STYLE}>{t('llmLabel', { value: formatCompactDuration(totals.llmMs, t) })}</span>
      <span style={CHIP_STYLE}>{t('toolLabel', { value: formatCompactDuration(totals.toolMs, t) })}</span>
      <span style={CHIP_STYLE}>{t('tokensLabel', { value: formatCompactTokens(totals.totalTokens, t) })}</span>
      <span style={CHIP_STYLE}>{t('turnsLabel', { value: totals.turns })}</span>
    </div>
  )
}

/** One step: its clock, its model, and the calls it made. */
function StepRow({ turn, step, now, t }: {
  readonly turn: TurnLive
  readonly step: StepFacts
  readonly now: number
  readonly t: LiveTranslate
}): ReactNode {
  // A closed step carries its own span; a running one is measured against the
  // render clock, which the tick above advances once a second.
  const elapsed = step.elapsedMs ?? Math.max(0, now - step.startedAt)
  return (
    <div style={STEP_STYLE(step.running)}>
      <div style={STEP_HEAD_STYLE}>
        <span style={STEP_ID_STYLE}>#{step.step}</span>
        <span style={STEP_META_STYLE}>turn {turn.turn}</span>
        <span style={STEP_TIME_STYLE}>{formatCompactDuration(elapsed, t)}</span>
        {step.running && <span style={RUNNING_STYLE}>{t('stepRunning')}</span>}
        {step.route !== null && <span style={STEP_MODEL_STYLE}>{step.route.model}</span>}
      </div>
      <div style={TOOLS_STYLE}>
        {step.tools.length === 0
          ? <span style={TOOL_EMPTY_STYLE}>{t('noTools')}</span>
          : step.tools.map(tool => <ToolChip key={tool.callId} tool={tool} now={now} t={t} />)}
      </div>
    </div>
  )
}

/** One tool call, running or settled. */
function ToolChip({ tool, now, t }: {
  readonly tool: ToolCallFacts
  readonly now: number
  readonly t: LiveTranslate
}): ReactNode {
  const elapsed = tool.elapsedMs ?? (tool.running ? Math.max(0, now - tool.startedAt) : null)
  return (
    <span style={TOOL_STYLE(tool)}>
      <span style={TOOL_NAME_STYLE}>{tool.name}</span>
      {elapsed !== null && <span style={TOOL_META_STYLE}>{formatCompactDuration(elapsed, t)}</span>}
      {tool.running && <span style={TOOL_META_STYLE}>{t('toolRunning')}</span>}
      {tool.failed && <span style={TOOL_FAIL_STYLE}>{t('toolFailed')}</span>}
    </span>
  )
}

/** One event-stream line. */
function StreamRow({ line }: { readonly line: StreamLine }): ReactNode {
  return (
    <div style={STREAM_ROW_STYLE}>
      <span style={STREAM_TIME_STYLE}>{clockOf(line.time)}</span>
      <span style={STREAM_TYPE_STYLE}>{line.type}</span>
      <span style={STREAM_DETAIL_STYLE}>{line.detail}</span>
    </div>
  )
}

/**
 * `HH:MM:SS` in the reader's own zone.
 *
 * A log line is read against a wall clock — "what happened at 14:03" — so this is
 * a local rendering rather than a duration, and it is built by hand rather than
 * through `toLocaleTimeString` so the column width does not move between locales.
 * @param time - epoch ms.
 * @returns the zero-padded clock text.
 */
function clockOf(time: number): string {
  const date = new Date(time)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// --- Styles ---------------------------------------------------------------

/** Full-bleed surface that scrolls itself; see ui-chat's `.scrollBody` rules. */
const ROOT_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  height: '100%',
  padding: '12px 16px 24px',
  overflowY: 'auto',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 12,
}

const HEADING_STYLE: CSSProperties = {
  margin: '6px 0 0',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--dsw-alias-label-secondary)',
}

const EMPTY_STYLE: CSSProperties = {
  padding: '16px 0',
  color: 'var(--dsw-alias-label-tertiary)',
}

const LIST_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

/** The one action this view offers: pull the rest of the session in. */
function LOAD_STYLE(loading: boolean): CSSProperties {
  return {
    alignSelf: 'flex-start',
    padding: '4px 12px',
    border: 'none',
    borderRadius: 8,
    background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-label-secondary)',
    font: 'inherit',
    fontSize: 12,
    cursor: loading ? 'default' : 'pointer',
    opacity: loading ? 0.55 : 1,
  }
}

const BAR_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 10,
  borderRadius: 10,
  background: 'var(--dsw-alias-bg-layer-2)',
}

const BAR_HEAD_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 8,
}

const BAR_LABEL_STYLE: CSSProperties = {
  fontWeight: 600,
  color: 'var(--dsw-alias-label-secondary)',
}

const BAR_VALUE_STYLE: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--dsw-alias-label-secondary)',
}

const BAR_TRACK_STYLE: CSSProperties = {
  height: 6,
  borderRadius: 3,
  overflow: 'hidden',
  background: 'var(--dsw-alias-bg-layer-1)',
}

/**
 * The fill. Width is the fraction and nothing else — no minimum sliver, because
 * a bar that always paints something cannot say "nothing is loaded yet".
 */
function BAR_FILL_STYLE(fraction: number): CSSProperties {
  return {
    width: `${String(Math.round(fraction * 100))}%`,
    height: '100%',
    borderRadius: 3,
    background: 'var(--dsw-alias-brand-primary)',
    transition: 'width 200ms ease',
  }
}

const BAR_HINT_STYLE: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
}

const TOTALS_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}

const CHIP_STYLE: CSSProperties = {
  padding: '2px 8px',
  borderRadius: 999,
  background: 'var(--dsw-alias-bg-layer-2)',
  color: 'var(--dsw-alias-label-secondary)',
  fontVariantNumeric: 'tabular-nums',
}

/** A running step is outlined, so the eye finds it without reading the clocks. */
function STEP_STYLE(running: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '8px 10px',
    borderRadius: 10,
    background: 'var(--dsw-alias-bg-layer-2)',
    boxShadow: running ? 'inset 0 0 0 1px var(--dsw-alias-brand-primary)' : 'none',
  }
}

const STEP_HEAD_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  flexWrap: 'wrap',
  gap: 8,
}

const STEP_ID_STYLE: CSSProperties = {
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
}

const STEP_META_STYLE: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
}

const STEP_TIME_STYLE: CSSProperties = {
  marginLeft: 'auto',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--dsw-alias-label-secondary)',
}

const RUNNING_STYLE: CSSProperties = {
  padding: '1px 6px',
  borderRadius: 999,
  background: 'var(--dsw-alias-brand-primary)',
  color: 'var(--dsw-alias-label-primary-foreground)',
}

const STEP_MODEL_STYLE: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
}

const TOOLS_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
}

const TOOL_EMPTY_STYLE: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
}

/** A failed call is outlined in the error colour; a running one stays neutral. */
function TOOL_STYLE(tool: ToolCallFacts): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 6,
    padding: '1px 8px',
    borderRadius: 6,
    background: 'var(--dsw-alias-bg-layer-1)',
    boxShadow: tool.failed ? 'inset 0 0 0 1px var(--dsw-alias-state-error-primary)' : 'none',
  }
}

const TOOL_NAME_STYLE: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
}

const TOOL_META_STYLE: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontVariantNumeric: 'tabular-nums',
}

const TOOL_FAIL_STYLE: CSSProperties = {
  color: 'var(--dsw-alias-state-error-primary)',
}

const STREAM_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  padding: '2px 0',
  fontVariantNumeric: 'tabular-nums',
}

const STREAM_TIME_STYLE: CSSProperties = {
  flex: 'none',
  color: 'var(--dsw-alias-label-tertiary)',
}

const STREAM_TYPE_STYLE: CSSProperties = {
  flex: 'none',
  minWidth: 140,
  color: 'var(--dsw-alias-label-primary)',
}

const STREAM_DETAIL_STYLE: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
