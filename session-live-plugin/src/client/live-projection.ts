/**
 * The session-wide half of the live view: how full the context is, and what the
 * session has spent so far.
 *
 * Both ride the client session's own projection faces rather than the rendered
 * transcript, for the reason the sibling usage view gives: `ISession.projections`
 * is a public read face, and these projections are Host-computed over the WHOLE
 * log — paging the window in or compacting it cannot move them. Reading numbers
 * also avoids parsing formatted text back into the value it was printed from.
 *
 * The per-step detail deliberately does NOT come from here: no projection carries
 * a step or tool dimension, so that half is folded from the session's own event
 * window (`live-facts.ts`).
 *
 * `contextPressure` deserves a note because its three fields are what make a live
 * occupancy figure honest. Its numerator is prompt-side only, so it holds still
 * while a turn streams and steps forward when the next request reports its usage
 * — which is also why it cannot see a compaction by itself. The projection
 * therefore also publishes `projectedTokens`, the sample plus the surface's signed
 * movement since it was taken, so the figure answers for the NEXT request rather
 * than the last one. Both are surfaced here rather than picked between: which one
 * a reader wants depends on whether they are asking "what did we just send" or
 * "what are we about to send".
 */
import type { MessagesKey } from './locales.ts'

/** The projection read face this module needs; see `ISession['projections']`. */
export interface ProjectionsFaceLike {
  /** The identity-stable bare observable for one projection key. */
  faceOf(key: string): { getSnapshot(): unknown }
}

/** How full the model's context is, as the host's own projection reports it. */
export interface ContextOccupancy {
  /** The route's context window in tokens, or null when none was reported. */
  readonly contextWindow: number | null
  /** Prompt-side tokens the last request actually billed, or null. */
  readonly pressureTokens: number | null
  /** The occupancy the NEXT request is expected to carry, or null. */
  readonly projectedTokens: number | null
  /** {@link projectedTokens} over {@link contextWindow} in 0..1, or null when either is unknown. */
  readonly fraction: number | null
}

/** What the session has spent so far, folded by the Host over the whole log. */
export interface LiveTotals {
  /** Model request wall time, milliseconds. */
  readonly llmMs: number
  /** Tool wall time, milliseconds. */
  readonly toolMs: number
  /** Completed turns the Host counted for the whole session. */
  readonly turns: number
  /** Billed input (uncached + cache read + cache write) plus output tokens. */
  readonly totalTokens: number
}

/** The `contextPressure` projection's view fields this module reads. */
interface ContextPressureView {
  contextWindow?: number
  pressureTokens?: number
  projectedTokens?: number
}

/** The `sessionStats` projection's view fields this module reads. */
interface SessionStatsView {
  llmMs?: number
  toolMs?: number
  turns?: number
}

/** The `tokenUsage` projection's view fields this module reads. */
interface TokenUsageView {
  uncachedInputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/** A finite, non-negative number, or null — the only shape a figure may enter as. */
function figure(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Read the context occupancy from the session's projections.
 * @param projections - the owning session's projection read face.
 * @returns the occupancy, or null when the host serves no `contextPressure`.
 */
export function readOccupancy(projections: ProjectionsFaceLike): ContextOccupancy | null {
  const view = projections.faceOf('contextPressure').getSnapshot() as ContextPressureView | undefined
  if (view === undefined) return null
  const contextWindow = figure(view.contextWindow)
  const projectedTokens = figure(view.projectedTokens)
  return {
    contextWindow,
    pressureTokens: figure(view.pressureTokens),
    projectedTokens,
    // The fraction is derived only from the PROJECTED figure: the raw sample is
    // what a previous request saw, and dividing that by a window the request
    // never saw would print a share that no request was ever at.
    fraction: contextWindow === null || contextWindow === 0 || projectedTokens === null
      ? null
      : Math.min(1, projectedTokens / contextWindow),
  }
}

/**
 * Read the session's totals from its projections.
 * @param projections - the owning session's projection read face.
 * @returns the totals, or null when the host served neither projection.
 */
export function readTotals(projections: ProjectionsFaceLike): LiveTotals | null {
  const stats = projections.faceOf('sessionStats').getSnapshot() as SessionStatsView | undefined
  const usage = projections.faceOf('tokenUsage').getSnapshot() as TokenUsageView | undefined
  if (stats === undefined && usage === undefined) return null
  return {
    llmMs: stats?.llmMs ?? 0,
    toolMs: stats?.toolMs ?? 0,
    turns: stats?.turns ?? 0,
    totalTokens: (usage?.uncachedInputTokens ?? 0)
      + (usage?.cacheReadTokens ?? 0)
      + (usage?.cacheWriteTokens ?? 0)
      + (usage?.outputTokens ?? 0),
  }
}

/**
 * Compact token count: `517` / `12.2K` / `517K` / `1.2M`.
 * @param value - non-negative token count.
 * @param t - this plugin's locale seat.
 * @returns the display string.
 */
export function formatCompactTokens(value: number, t: (key: MessagesKey, params?: Record<string, unknown>) => string): string {
  if (value < 1_000) return String(Math.round(value))
  if (value < 1_000_000) return t('numberThousand', { value: scaled(value / 1_000) })
  return t('numberMillion', { value: scaled(value / 1_000_000) })
}

/**
 * Compact duration: `45.2s` under a minute, `2m42s` from there on.
 * @param ms - duration in milliseconds.
 * @param t - this plugin's locale seat.
 * @returns the display string.
 */
export function formatCompactDuration(ms: number, t: (key: MessagesKey, params?: Record<string, unknown>) => string): string {
  const seconds = ms / 1_000
  if (seconds < 60) return t('durationSeconds', { seconds: Math.round(seconds * 10) / 10 })
  const whole = Math.round(seconds)
  return t('durationMinutes', { minutes: Math.floor(whole / 60), seconds: whole % 60 })
}

/** One decimal below a hundred, whole numbers from there, as the host scales them. */
function scaled(candidate: number): string {
  return candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10)
}
