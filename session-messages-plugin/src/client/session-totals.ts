/**
 * Session-wide facts for the overlay's header and the viewport strip: the
 * totals, and the model route the session runs.
 *
 * They ride the client session's own projection faces rather than the rendered
 * transcript. That is the same reason the message list reads the DOM and this
 * does not: a third-party plugin cannot reach `ui-chat`'s node store, but
 * `ISession.projections` is a public read face, and these projections are
 * Host-computed over the WHOLE log — paging the window in or compacting it
 * cannot change them. Reading numbers also avoids parsing formatted text
 * (a compact `1.2K`) back into the value it was printed from.
 *
 * Granularity is worth stating plainly, because the strip mixes two: a turn's
 * usage and duration come from that turn's own tail pills, while everything
 * here is SESSION-wide.
 *
 * Those two numbers ARE reachable over a public API — a `conversation.chat.node`
 * occupant is handed its `ChatNode` plus a `useTurnData` hook, enough to read
 * that Turn's `TurnTokenUsage` and derive its wall time from
 * `node.location.turn.start/end`. But the hook is scoped to the ONE turn that
 * node renders, and this plugin cannot take such a seat: the slot's keys are
 * ui-chat's own `ChatNodeKind`s, and occupying one REPLACES ui-chat's renderer.
 * The list needs EVERY turn and the strip needs whichever turn sits under the
 * fold, so the tail pills stay the only source that answers "any turn, both
 * numbers" — at the price of reading formatted text rather than numbers.
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

/** The `modelSelection` projection's view fields this module reads. */
interface ModelSelectionView {
  lastUsed?: { provider?: unknown; model?: unknown } | null
  next?: { provider?: unknown; model?: unknown } | null
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
  return {
    busyMs: (stats?.llmMs ?? 0) + (stats?.toolMs ?? 0),
    totalTokens: billedInputOf(usage) + (usage?.outputTokens ?? 0),
    cacheHitPercent: cacheHitOfUsage(usage),
  }
}

/** Billed prompt tokens: the three disjoint input buckets, summed. */
function billedInputOf(usage: TokenUsageView | undefined): number {
  return (usage?.uncachedInputTokens ?? 0)
    + (usage?.cacheReadTokens ?? 0)
    + (usage?.cacheWriteTokens ?? 0)
}

/**
 * Cache-hit share of one `tokenUsage` view, or null when nothing was billed.
 *
 * Exposed over the raw view, not over a face, because the viewport strip reads
 * its projections through the slot's standard `useProjection` seat: that read is
 * reactive, so the field appears the moment the Host publishes it instead of
 * waiting for the next poll, and it cannot come back empty just because the
 * frame loop happened to run before the session binding existed.
 * @param value - the projection's view, or undefined while the unit is absent.
 * @returns the share to print, or null.
 */
export function cacheHitOfUsage(value: unknown): number | null {
  const usage = value as TokenUsageView | undefined
  return cacheHitPercent(usage?.cacheReadTokens ?? 0, billedInputOf(usage))
}

/**
 * The model a session runs, from one `modelSelection` view.
 *
 * `lastUsed` is the route the most recent request actually went out on — the
 * honest answer to "which model produced what I am looking at". `next` is the
 * fallback for a session that has picked a model but not yet sent a request
 * (`next` is the projection's own `pending ?? lastUsed`, so it is never older).
 *
 * Only the model id is read, not a human-readable name: the display name lives in
 * the model DIRECTORY service, which is a selection surface that lazily creates
 * per-session state and throws for a session outside the active list — not
 * something a read-only label should pull in.
 * @param value - the projection's view, or undefined while the unit is absent.
 * @returns the model id, or null when no route is recorded.
 */
export function modelOfSelection(value: unknown): string | null {
  const selection = value as ModelSelectionView | undefined
  const chosen = selection?.lastUsed ?? selection?.next
  const model = chosen?.model
  return typeof model === 'string' && model !== '' ? model : null
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
