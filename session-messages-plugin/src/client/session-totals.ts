/**
 * Session-wide totals for the overlay's header.
 *
 * They ride the client session's own projection faces rather than the rendered
 * transcript. That is the same reason the message list reads the DOM and this
 * does not: a third-party plugin cannot reach `ui-chat`'s node store, but
 * `ISession.projections` is a public read face, and the two projections are
 * Host-computed over the WHOLE log — paging the window in or compacting it
 * cannot change them. Reading numbers also avoids parsing formatted text
 * (a compact `1.2K`) back into the value it was printed from.
 *
 * Formatting follows the host's own conventions so the header reads like the
 * rest of the product: the same compact token count, the same `45.2s` /
 * `2m42s` duration, and a cache-hit share that never rounds a partial hit up
 * to a full 100%.
 */
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { MessagesKey } from './locales.ts'

/** The projection read face this module needs; see `ISession['projections']`. */
export interface ProjectionsFaceLike {
  /** The identity-stable bare observable for one projection key. */
  faceOf(key: string): { getSnapshot(): unknown }
}

/** Session totals the header renders. */
export interface SessionTotals {
  /** Summed model request plus tool wall time, in milliseconds. */
  readonly busyMs: number
  /** Billed input (uncached + cache read + cache write) plus output tokens. */
  readonly totalTokens: number
  /** Cache reads as a share of billed input, or null when nothing was billed. */
  readonly cacheHitPercent: number | null
}

/** The `sessionStats` projection's view fields this module reads. */
interface SessionStatsView {
  llmMs?: number
  toolMs?: number
}

/** The `tokenUsage` projection's view fields this module reads. */
interface TokenUsageView {
  uncachedInputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/**
 * Cache-hit share of billed input, or null when there is no billed input.
 *
 * A partial hit must never print as a full one, so anything that rounds to 100
 * without every billed prompt token coming from cache is held at 99.9 — the
 * host's own rule, reached here by clamping rather than by its precision search.
 * @param cacheReadTokens - prompt tokens served from cache.
 * @param billedInputTokens - uncached + cache read + cache write prompt tokens.
 * @returns the share to print, with at most one decimal.
 */
function cacheHitPercent(cacheReadTokens: number, billedInputTokens: number): number | null {
  if (billedInputTokens <= 0) return null
  if (cacheReadTokens >= billedInputTokens) return 100
  const rounded = Math.round((cacheReadTokens / billedInputTokens) * 1_000) / 10
  return rounded >= 100 ? 99.9 : rounded
}

/**
 * Read the session's totals from its projections.
 * @param projections - the owning session's projection read face.
 * @returns the totals, or null when the host served neither projection.
 */
export function readSessionTotals(projections: ProjectionsFaceLike): SessionTotals | null {
  const stats = projections.faceOf('sessionStats').getSnapshot() as SessionStatsView | undefined
  const usage = projections.faceOf('tokenUsage').getSnapshot() as TokenUsageView | undefined
  if (stats === undefined && usage === undefined) return null
  const billedInput = (usage?.uncachedInputTokens ?? 0)
    + (usage?.cacheReadTokens ?? 0)
    + (usage?.cacheWriteTokens ?? 0)
  return {
    busyMs: (stats?.llmMs ?? 0) + (stats?.toolMs ?? 0),
    totalTokens: billedInput + (usage?.outputTokens ?? 0),
    cacheHitPercent: cacheHitPercent(usage?.cacheReadTokens ?? 0, billedInput),
  }
}

/** One decimal below a hundred, whole numbers from there, as the host scales them. */
function scaled(candidate: number): string {
  return candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10)
}

/**
 * Compact token count: `517` / `12.2K` / `517K` / `1.2M`.
 * @param value - non-negative token count.
 * @param t - this plugin's locale seat.
 * @returns the display string.
 */
export function formatCompactTokens(value: number, t: Translate<MessagesKey>): string {
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return t('numberThousand', { value: scaled(value / 1_000) })
  return t('numberMillion', { value: scaled(value / 1_000_000) })
}

/**
 * Compact duration: `45.2s` under a minute, `2m42s` from there on.
 * @param ms - duration in milliseconds.
 * @param t - this plugin's locale seat.
 * @returns the display string.
 */
export function formatCompactDuration(ms: number, t: Translate<MessagesKey>): string {
  const seconds = ms / 1_000
  if (seconds < 60) return t('durationSeconds', { seconds: Math.round(seconds * 10) / 10 })
  const whole = Math.round(seconds)
  return t('durationMinutes', { minutes: Math.floor(whole / 60), seconds: whole % 60 })
}
