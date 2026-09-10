/**
 * The in-session session-messages overlay.
 *
 * Lists every user message of the CURRENT session and jumps the transcript to
 * the chosen one. Registered into the `shell.overlay` slot, so it stays mounted
 * for the whole session and renders null while closed — the same shape the
 * slash menu uses to keep its keyboard state alive.
 *
 * The list is read from the rendered transcript rather than from the session
 * model. That is deliberate: a third-party plugin cannot reach `ui-chat`'s
 * node store, but ChatView itself resolves its scroll anchors through these two
 * attributes, so they are contracts rather than internals:
 *
 * - `[data-conversation-scroll]` — the scrollport (ChatView's own `scrollerOf`).
 * - `[data-chat-flow-kind="user"|"steering"]` — one human message row.
 *
 * Only the loaded window is listed. Earlier messages arrives without a manual
 * control: opening fills the list to `maxRows`, and the prefetch pulls the next
 * page in through the session face as the highlight nears the oldest loaded row.
 */
import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
  type CSSProperties, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { CONFIG_GLOBAL, resolveConfig, type MessagesConfig } from '../shared.ts'
import {
  formatCompactDuration, formatCompactTokens, type SessionTotals,
} from './session-totals.ts'
import type { MessagesKey } from './locales.ts'
import { readScope, subscribeScope } from './settings-scope-holder.ts'

/** One listed message. */
export interface MessageEntry {
  /** Stable-ish identity for React keys; the DOM node key. */
  readonly id: string
  /** Message text preview, with the trailing timestamp leaf stripped. */
  readonly text: string
  /** Clock label rendered by ui-chat's IconActions (for example `21:36`); null when absent. */
  readonly timestamp: string | null
  /** Usage pill label of this message's turn (for example `消费 1.2k`); null when the turn carries none. */
  readonly usage: string | null
  /** Duration pill label of this message's turn (for example `用时 12.3s`); null when the turn carries none. */
  readonly duration: string | null
  /** Whether the row sat inside the transcript's scroll viewport when collected. */
  readonly visible: boolean
}

/** Props the slot hands the component: standard shares plus the inject face. */
export interface MessagesOverlaySlotProps {
  /** Injected: page one earlier messages window in, if any remains. */
  loadOlder: () => Promise<void>
  /** Injected: whether older messages remains to page in. */
  hasMore: () => boolean
  /** Injected: the current session's totals, or null when its projections are absent. */
  sessionTotals: () => SessionTotals | null
  /** Locale-bound translate function. */
  t: Translate<MessagesKey>
}

interface OverlayProps {
  /** Resolved configuration. */
  readonly config: MessagesConfig
  /** Injected: page one earlier messages window in. */
  readonly loadOlder: () => Promise<void>
  /** Injected: whether older messages remains to page in. */
  readonly hasMore: () => boolean
  /** Injected: the current session's totals, or null when its projections are absent. */
  readonly sessionTotals: () => SessionTotals | null
  /** Locale-bound translate function. */
  readonly t: Translate<MessagesKey>
}

/** Vertical breathing room above a landed row, matching ChatView's own jump. */
const LAND_OFFSET_PX = 24

/** Hard cap on the preview string so the line-clamp runs in O(1). */
const MAX_PREVIEW_CHARS = 240

/** DOM id of one row, the aria-activedescendant target. */
function rowId(index: number): string {
  return `dsh-messages-row-${String(index)}`
}

/**
 * Scroll one listbox row into view if it is currently outside the viewport.
 * The listbox is the only scroll container this plugin owns, so we scroll it
 * directly rather than calling `scrollIntoView` — that call would also try to
 * scroll any other scrollable ancestor (typically the body), which would jump
 * the page behind the fixed dialog. Bound to keyboard activation only — the
 * mouse already follows the user's pointer, so the row is always in view.
 *
 * Measured with `getBoundingClientRect` deltas, not `offsetTop`: the latter is
 * relative to the nearest POSITIONED ancestor, which is the dialog card, so it
 * carries the height of every block above the listbox and mis-sizes the scroll
 * in both directions.
 */
function scrollRowIntoView(listbox: HTMLDivElement | null, index: number): void {
  if (listbox === null || index < 0) return
  const row = listbox.querySelector<HTMLElement>(`#${rowId(index)}`)
  if (row === null) return
  const rowBox = row.getBoundingClientRect()
  const viewBox = listbox.getBoundingClientRect()
  // Incremental: pull the offending edge back by exactly the overflow amount,
  // so one Arrow press scrolls at most one row height.
  if (rowBox.top < viewBox.top) {
    listbox.scrollTop -= viewBox.top - rowBox.top
  } else if (rowBox.bottom > viewBox.bottom) {
    listbox.scrollTop += rowBox.bottom - viewBox.bottom
  }
}

/**
 * Vertical offset of one row from the listbox viewport's top edge, in the
 * current scroll position. Negative when the row sits above the viewport.
 * Null when the row is not rendered.
 */
function rowOffset(listbox: HTMLDivElement, index: number): number | null {
  const row = listbox.querySelector<HTMLElement>(`#${rowId(index)}`)
  if (row === null) return null
  return row.getBoundingClientRect().top - listbox.getBoundingClientRect().top
}

/**
 * One page for the paging keys: how many rows currently fit in the listbox
 * viewport. Measured rather than assumed because rows are one or two lines
 * tall depending on the preview. Minus one so consecutive pages share a row and
 * the user keeps a landmark across the jump.
 */
function pageStep(listbox: HTMLDivElement | null): number {
  if (listbox === null) return 1
  const viewBox = listbox.getBoundingClientRect()
  let count = 0
  for (const row of listbox.querySelectorAll<HTMLElement>('[role="option"]')) {
    const box = row.getBoundingClientRect()
    if (box.bottom > viewBox.top && box.top < viewBox.bottom) count += 1
  }
  return Math.max(1, count - 1)
}

/**
 * First rendered index of the listbox window, or 0 when the whole list fits.
 *
 * The list collects every loaded message, but renders at most `maxRows` rows.
 * That window follows the highlight: anchoring it at index 0 hid every message
 * newer than the cap, so a small `maxRows` could never reach the newest message,
 * and a highlight past the cap addressed rows the DOM does not hold.
 *
 * Windows are page-aligned rather than centered on the highlight: consecutive
 * pages then tile the list without a gap, and the rendered rows stay fixed while
 * the reader moves inside one page — centering would rebuild the rows on every
 * step and skip the row that falls between two centered windows.
 * @param active - highlighted index into the full entry list.
 * @param total - number of collected entries.
 * @param maxRows - configured window size.
 * @returns the first index to render, clamped so the last page meets the end.
 */
function windowStart(active: number, total: number, maxRows: number): number {
  if (total <= maxRows) return 0
  return Math.min(Math.floor(active / maxRows) * maxRows, total - maxRows)
}

/** Capture-phase document listener helper returning its disposer. */
function onDocumentKeyDown(handler: (event: KeyboardEvent) => void): () => void {
  document.addEventListener('keydown', handler, true)
  return () => { document.removeEventListener('keydown', handler, true) }
}

/** Whether a keydown matches the configured chord exactly. */
function matchesChord(event: KeyboardEvent, config: MessagesConfig): boolean {
  return event.key.toLowerCase() === config.key.toLowerCase()
    && event.ctrlKey === config.ctrl
    && event.altKey === config.alt
    && event.shiftKey === config.shift
    && event.metaKey === config.meta
}

/** The transcript's scrollport, or null when no conversation is mounted. */
function scrollport(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-conversation-scroll]')
}

/**
 * Identify a clock label leaf. ui-chat's `formatMessageClock` (in
 * `packages/client/ui-chat/src/client/chat/message-chrome.ts`) produces three
 * families: same-day `HH:mm`; same-year `M月D日` (zh) or `Mon D[, YYYY]`
 * (en) optionally followed by `HH:mm`; and the same with a four-digit year.
 * Strict full-string match — a substring of the message text that happens to
 * contain a time-shaped fragment is intentionally NOT considered a timestamp.
 */
const TIMESTAMP_PATTERN = /^(?:\d{1,2}:\d{2}|\d{1,2}月\d{1,2}日|\d{4}[-/\u5e74]\d{1,2}[-/\u6708]\d{1,2}\u65e5?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:,\s+\d{4})?)(?:\s+\d{1,2}:\d{2})?$/u

function looksLikeTimestamp(text: string): boolean {
  const t = text.trim()
  if (t === '') return false
  return TIMESTAMP_PATTERN.test(t)
}

/**
 * Split a chat row into the message text and an optional clock label.
 *
 * The IconActions time is a leaf sibling of the message bubble inside the row;
 * we identify it by content rather than by a stable selector because the
 * third-party plugin cannot import the host's hashed CSS module classes. The
 * clone-and-prune approach keeps the source row untouched so React's own
 * rendering of the transcript is unaffected.
 */
function splitEntry(row: HTMLElement): { text: string; timestamp: string | null } {
  const clone = row.cloneNode(true) as HTMLElement
  let timestamp: string | null = null
  const targets = [clone, ...clone.querySelectorAll<HTMLElement>('*')]
  for (const el of targets) {
    if (el.children.length > 0) continue
    const t = (el.textContent ?? '').trim()
    if (t === '' || !looksLikeTimestamp(t)) continue
    if (timestamp === null) timestamp = t
    el.remove()
  }
  const text = (clone.textContent ?? '').replace(/\s+/gu, ' ').trim()
  return { text, timestamp }
}

/**
 * How close to the floor still counts as "following the newest message".
 * Mirrors ChatView's own FOLLOW_THRESHOLD: the same question, asked to decide
 * the opening highlight rather than scroll ownership.
 */
const FOLLOW_THRESHOLD_PX = 24

/**
 * How much of a row must be inside the viewport before it counts as
 * "displayed". A row that only pokes a few pixels in is geometrically inside
 * the viewport but the reader has not reached it yet — the previous message is
 * still the one they are looking at. 30 px is roughly half a row to a full
 * row on the common chat density.
 */
const VISIBLE_MIN_PX = 30

/**
 * Wheel travel that moves the highlight one row. One notch of a notched mouse
 * reports about 100 px, so a notch is exactly one row; a trackpad streams much
 * smaller deltas and accumulates to the same step. Without the threshold a
 * trackpad's event-per-pixel stream would run the highlight down the list.
 */
const WHEEL_STEP_PX = 100

/**
 * How close to the oldest loaded row the highlight must get before older
 * messages is paged in automatically. Generous enough that a page-sized jump
 * (≈14 rows) lands the reader with messages already present.
 */
const PREFETCH_AHEAD = 8

/**
 * Consecutive pages that add no user message before a fill loop gives up.
 * A messages page is 50 durable events, and a tool-heavy stretch can hold none
 * of ours, so a single empty page is normal — three in a row is not.
 */
const MAX_NO_PROGRESS = 3

/** One collection pass over the rendered transcript. */
interface Collected {
  /** One entry per rendered user message row, in transcript order. */
  readonly entries: MessageEntry[]
  /** Whether the transcript sat pinned to its floor, i.e. the reader is on the newest message. */
  readonly pinnedToBottom: boolean
}

/**
 * Read every rendered turn's usage and duration labels from its tail.
 *
 * The host owns both the numbers and their formatting: a turn's tail already
 * carries a usage pill (`消费 1.2k` / `Consumed 1.2k`) and a duration pill
 * (`用时 12.3s` / `Ran for 12.3s`), localized by ui-chat, so the overlay reuses
 * those labels instead of deriving tokens or wall time itself. The pills are
 * plain buttons with hashed class names, so they are located by contract
 * position: `[data-turn-tail]` is the turn tail, and its LAST two
 * `aria-haspopup="dialog"` buttons are exactly the usage panel and the time
 * panel, in that order (TurnTailNodeView seats them after the branch action).
 * Their icons tell them apart — the usage pill draws an ellipse, the time pill
 * a circle. A pill hidden by the tail's hover-reveal keeps its text; opacity
 * does not remove it from the DOM.
 * @param scroller - the transcript scrollport.
 * @returns one `{ usage, duration }` per turn, keyed by the turn's number.
 */
function collectTurnStats(scroller: HTMLElement): Map<string, { usage: string | null; duration: string | null }> {
  const stats = new Map<string, { usage: string | null; duration: string | null }>()
  for (const tail of scroller.querySelectorAll<HTMLElement>('[data-turn-tail]')) {
    const turn = tail.dataset.turnTail
    if (turn === undefined) continue
    const pills = [...tail.querySelectorAll<HTMLElement>('button[aria-haspopup="dialog"]')].slice(-2)
    let usage: string | null = null
    let duration: string | null = null
    for (const pill of pills) {
      const label = (pill.textContent ?? '').trim()
      // Both host labels always carry a number (a token count, a duration);
      // an icon-only button from the assistant-actions slot carries none.
      if (label === '' || !/\d/u.test(label)) continue
      if (pill.querySelector('svg ellipse') !== null) usage = label
      else if (pill.querySelector('svg circle') !== null) duration = label
    }
    if (usage !== null || duration !== null) stats.set(turn, { usage, duration })
  }
  return stats
}

/**
 * Collect the current session's human messages in transcript order, marking
 * each one with whether it sits inside the transcript's scroll viewport at
 * collection time. Also reports whether the transcript is pinned to the bottom,
 * which is what tells "the reader is on the newest message" apart from "the
 * reader is parked mid-list".
 * @returns the collected rows and the scroll state they were read under.
 */
function collectMessages(): Collected {
  const scroller = scrollport()
  if (scroller === null) return { entries: [], pinnedToBottom: false }
  const rows = scroller.querySelectorAll<HTMLElement>(
    '[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]',
  )
  const turnStats = collectTurnStats(scroller)
  const view = scroller.getBoundingClientRect()
  const entries: MessageEntry[] = []
  for (const row of rows) {
    if (row.hidden) continue
    const key = row.dataset.chatAnchorKey ?? row.dataset.chatFlowKey
    if (key === undefined) continue
    const { text, timestamp } = splitEntry(row)
    const stats = turnStats.get(row.dataset.chatTurn ?? '')
    const box = row.getBoundingClientRect()
    // A row that only pokes a few pixels into the viewport is geometrically
    // inside it but the reader has not yet reached it — the previous message
    // is still the one they're looking at. Require a meaningful slice
    // (≈ half a row to a full row) before treating the row as "displayed".
    const visibleTop = Math.max(box.top, view.top)
    const visibleBottom = Math.min(box.bottom, view.bottom)
    const visibleHeight = Math.max(0, visibleBottom - visibleTop)
    entries.push({
      id: key,
      text: text === '' ? '—' : text,
      timestamp,
      usage: stats?.usage ?? null,
      duration: stats?.duration ?? null,
      visible: visibleHeight >= VISIBLE_MIN_PX,
    })
  }
  const pinnedToBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
    <= FOLLOW_THRESHOLD_PX
  return { entries, pinnedToBottom }
}

/** Resolve one listed message back to its rendered row. */
function rowOf(id: string): HTMLElement | null {
  const scroller = scrollport()
  if (scroller === null) return null
  return scroller.querySelector<HTMLElement>(`[data-chat-anchor-key="${CSS.escape(id)}"]`)
}

/**
 * Land a row at the top of the scrollport — ChatView's own jump arithmetic.
 * @param row - target row inside the scrollport.
 */
function landOnRow(row: HTMLElement): void {
  const scroller = scrollport()
  if (scroller === null) return
  const delta = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  scroller.scrollTop += delta - LAND_OFFSET_PX
}

// --- Dialog ---------------------------------------------------------------

interface DialogProps {
  readonly title: string
  readonly closeLabel: string
  readonly onClose: () => void
  readonly children: ReactNode
}

/**
 * Centered, body-portaled dialog with a blurred mask and Escape handling.
 * The shared `Modal` primitive caps at 380px which is too narrow for a
 * two-line message preview, so the plugin renders its own. All visual tokens
 * come from the host's `--dsw-*` design system so the chrome matches the
 * rest of the shell.
 */
function Dialog({ title, closeLabel, onClose, children }: DialogProps): ReactNode {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [onClose])

  return createPortal((
    <div style={DIALOG_ROOT_STYLE}>
      <div onClick={onClose} style={DIALOG_MASK_STYLE} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={title} style={DIALOG_CARD_STYLE}>
        <div style={DIALOG_HEADER_STYLE}>
          <h2 style={DIALOG_TITLE_STYLE}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            style={DIALOG_CLOSE_STYLE}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)'
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = 'transparent'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  ), document.body)
}

const DIALOG_ROOT_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
}

const DIALOG_MASK_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'var(--dsw-alias-bg-mask-1)',
  backdropFilter: 'var(--dsw-mask-blur)',
}

const DIALOG_CARD_STYLE: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  width: 'min(520px, 100%)',
  maxHeight: 'calc(100vh - 48px)',
  padding: 20,
  overflow: 'hidden',
  borderRadius: 20,
  background: 'var(--dsw-alias-bg-layer-2)',
  boxShadow: 'var(--dsw-elevation-prominent)',
  color: 'var(--dsw-alias-label-primary)',
  fontFamily: 'var(--dsw-specific-font, -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif)',
  fontSize: 14,
  lineHeight: '20px',
}

const DIALOG_HEADER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}

const DIALOG_TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 16,
  lineHeight: '24px',
  fontWeight: 500,
  color: 'var(--dsw-alias-label-primary)',
}

const DIALOG_CLOSE_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 'none',
  width: 28,
  height: 28,
  padding: 0,
  border: 'none',
  borderRadius: 8,
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary)',
  cursor: 'pointer',
  transition: 'background 80ms ease',
}

// --- Sub-components -------------------------------------------------------

/**
 * The header line above the list: the session's own totals, then how much
 * messages the list holds.
 *
 * The totals are the whole session's, not the loaded window's: `用时` sums the
 * model and tool wall time the `sessionStats` projection kept over the entire
 * log, `用量` is billed input plus output from `tokenUsage`, and `缓存命中` is
 * the cache-read share of that billed input. Any of them missing (no projection,
 * no billed input yet) drops only its own clause.
 */
function ListHeader({ totals, count, t }: {
  readonly totals: SessionTotals | null
  readonly count: number
  readonly t: Translate<MessagesKey>
}): ReactNode {
  return (
    <div style={LIST_HEADER_STYLE}>
      {totals !== null && (
        <span style={SESSION_STATS_STYLE}>
          {t('sessionTime', { duration: formatCompactDuration(totals.busyMs, t) })}
          <span style={SEP_STYLE} aria-hidden="true">·</span>
          {t('sessionUsage', { total: formatCompactTokens(totals.totalTokens, t) })}
          {totals.cacheHitPercent !== null && (
            <>
              <span style={SEP_STYLE} aria-hidden="true">·</span>
              {t('sessionCacheHit', { percent: String(totals.cacheHitPercent) })}
            </>
          )}
        </span>
      )}
      <span style={COUNT_STYLE}>
        {count === 0 ? t('empty') : t('count', { count })}
      </span>
    </div>
  )
}

const LIST_HEADER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 12,
}

const SESSION_STATS_STYLE: CSSProperties = {
  fontSize: 12,
  color: 'var(--dsw-alias-label-primary)',
}

const SEP_STYLE: CSSProperties = {
  margin: '0 4px',
  color: 'var(--dsw-alias-label-tertiary)',
}

const COUNT_STYLE: CSSProperties = {
  flex: 'none',
  fontSize: 12,
  color: 'var(--dsw-alias-label-secondary)',
}

interface MessageRowProps {
  readonly entry: MessageEntry
  readonly index: number
  readonly active: boolean
  readonly onActivate: () => void
  readonly onJump: () => void
  readonly rowIdStr: string
}

function MessageRow({ entry, index, active, onActivate, onJump, rowIdStr }: MessageRowProps): ReactNode {
  const hasStats = entry.usage !== null || entry.duration !== null
  return (
    <button
      type="button"
      role="option"
      id={rowIdStr}
      aria-selected={active}
      onMouseMove={onActivate}
      onClick={onJump}
      style={ROW_STYLE(active)}
    >
      <span style={INDEX_STYLE}>{index + 1}</span>
      <span style={TEXT_STYLE}>{entry.text.slice(0, MAX_PREVIEW_CHARS)}</span>
      {hasStats && (
        <span style={STATS_STYLE}>
          {entry.usage !== null && <span>{entry.usage}</span>}
          {entry.duration !== null && <span>{entry.duration}</span>}
        </span>
      )}
      {entry.timestamp !== null && <span style={TIME_STYLE}>{entry.timestamp}</span>}
    </button>
  )
}

function ROW_STYLE(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    width: '100%',
    padding: '10px 12px',
    border: 'none',
    borderRadius: 10,
    textAlign: 'start',
    background: active ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
    color: 'inherit',
    font: 'inherit',
    cursor: 'pointer',
    transition: 'background 80ms ease',
  }
}

const INDEX_STYLE: CSSProperties = {
  flex: 'none',
  width: 22,
  textAlign: 'end',
  fontSize: 11,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--dsw-alias-label-tertiary)',
  paddingTop: 3,
  userSelect: 'none',
}

const TEXT_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  fontSize: 14,
  lineHeight: '20px',
  color: 'var(--dsw-alias-label-primary)',
  wordBreak: 'break-word',
}

const TIME_STYLE: CSSProperties = {
  flex: 'none',
  fontSize: 11,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--dsw-alias-label-tertiary)',
  paddingTop: 4,
  whiteSpace: 'nowrap',
}

/**
 * The turn's usage and duration, one per line, in the same meta tier as the
 * clock: read as a caption beside the message rather than as its content.
 */
const STATS_STYLE: CSSProperties = {
  flex: 'none',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 1,
  paddingTop: 3,
  fontSize: 11,
  lineHeight: '15px',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--dsw-alias-label-tertiary)',
  whiteSpace: 'nowrap',
}

/**
 * Label for the paging modifier key: Apple keyboards print `Option` (⌥) where
 * others print `Alt`. Display-only — the handler reads `event.altKey`, which is
 * the same physical key on every platform.
 */
const PAGING_MODIFIER_LABEL = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? '⌥' : 'Alt'

interface HintBarProps {
  readonly t: Translate<MessagesKey>
  /**
   * Configured wheel direction. The hint names the mapping the reader actually
   * has, so a changed setting is visible in the bar instead of only in how the
   * list reacts at its ends.
   */
  readonly wheelInverted: boolean
}

function HintBar({ t, wheelInverted }: HintBarProps): ReactNode {
  return (
    <div style={HINT_STYLE}>
      <Kbd>↑</Kbd>
      <Kbd>↓</Kbd>
      <span style={HINT_TEXT_STYLE}>{t('hintPick')}</span>
      <span style={HINT_GAP_STYLE} aria-hidden="true" />
      <WheelGlyph />
      <span style={HINT_TEXT_STYLE}>{t(wheelInverted ? 'hintWheelDown' : 'hintWheelUp')}</span>
      <span style={HINT_GAP_STYLE} aria-hidden="true" />
      <Kbd>{PAGING_MODIFIER_LABEL}</Kbd>
      <Kbd>↑</Kbd>
      <Kbd>↓</Kbd>
      <span style={HINT_TEXT_STYLE}>{t('hintPage')}</span>
      <span style={HINT_GAP_STYLE} aria-hidden="true" />
      <Kbd>↵</Kbd>
      <span style={HINT_TEXT_STYLE}>{t('hintJump')}</span>
      <span style={HINT_GAP_STYLE} aria-hidden="true" />
      <Kbd>Esc</Kbd>
      <span style={HINT_TEXT_STYLE}>{t('hintClose')}</span>
    </div>
  )
}

function Kbd({ children }: { readonly children: ReactNode }): ReactNode {
  return <kbd style={KBD_STYLE}>{children}</kbd>
}

/**
 * Mouse glyph for the wheel hint. `Kbd` labels keyboard keys and the wheel has
 * no key, so it gets its own glyph in the same capsule chrome: a mouse body
 * with the scroll wheel drawn on it.
 */
function WheelGlyph(): ReactNode {
  return (
    <kbd style={KBD_STYLE} aria-hidden="true">
      <svg width="11" height="15" viewBox="0 0 12 16" fill="none">
        <rect x="0.75" y="0.75" width="10.5" height="14.5" rx="5.25" stroke="currentColor" strokeWidth="1.25" />
        <path d="M6 4.25V6.75" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    </kbd>
  )
}

const HINT_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 6,
  paddingTop: 10,
  borderTop: '0.5px solid var(--dsw-alias-border-l2)',
  color: 'var(--dsw-alias-label-tertiary)',
}

const HINT_GAP_STYLE: CSSProperties = {
  display: 'inline-block',
  width: 8,
}

const HINT_TEXT_STYLE: CSSProperties = {
  fontSize: 11,
}

const KBD_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 20,
  height: 18,
  padding: '0 5px',
  border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 5,
  background: 'var(--dsw-alias-bg-layer-1)',
  color: 'var(--dsw-alias-label-secondary)',
  font: 'inherit',
  fontSize: 11,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
}

// --- Slot entry -----------------------------------------------------------

/**
 * Slot entry: owns the row list and renders the overlay.
 * @param props - the inject face and copy.
 * @returns the overlay tree.
 */
export function MessagesOverlaySlot({ loadOlder, hasMore, sessionTotals, t }: MessagesOverlaySlotProps): ReactNode {
  const config = useMessagesConfig()
  return (
    <MessagesOverlay
      config={config}
      loadOlder={loadOlder}
      hasMore={hasMore}
      sessionTotals={sessionTotals}
      t={t}
    />
  )
}

/**
 * Resolve the live configuration: the settings scope once it is bound, the
 * index-page global until then.
 *
 * The scope arrives through a nested inject, so the overlay usually mounts
 * before it exists. Subscribing to the holder and to the scope in turn means
 * the chord and `maxRows` follow the user's edits in Plugin configuration as
 * soon as the service appears, and a host with no settings service keeps the
 * composed value the Node half published.
 */
function useMessagesConfig(): MessagesConfig {
  const scope = useSyncExternalStore(subscribeScope, readScope, readScope)
  const subscribe = useCallback(
    (listener: () => void) => (scope === undefined ? () => {} : scope.subscribe(listener)),
    [scope],
  )
  const getSnapshot = useCallback(
    () => (scope === undefined ? undefined : scope.getSnapshot().value),
    [scope],
  )
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return useMemo(
    () => value !== undefined
      ? resolveConfig(value)
      : resolveConfig((globalThis as Record<string, unknown>)[CONFIG_GLOBAL]),
    [value],
  )
}

/**
 * Render the overlay: closed state returns null but keeps the listeners mounted.
 * @param props - configuration, the paging actions, and copy.
 * @returns the overlay tree.
 */
export function MessagesOverlay({ config, loadOlder, hasMore, sessionTotals, t }: OverlayProps) {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<readonly MessageEntry[]>([])
  /**
   * The highlight is tracked by row id, not index. Paging older messages
   * PREPENDS rows, which would silently slide an index-based highlight onto a
   * different message; the id survives, so the reader keeps their place and the
   * prefetch below self-limits (their index grows by the rows added).
   */
  const [activeId, setActiveId] = useState<string | null>(null)
  // Scroll viewport owned by this component; the keyboard handler scrolls
  // it directly so the rest of the page behind the fixed dialog stays put.
  const listboxRef = useRef<HTMLDivElement | null>(null)
  /** Synchronous mirror of `entries`: the loader loops must read it inside one pass. */
  const entriesRef = useRef<readonly MessageEntry[]>([])
  /** Serializes loads so an effect-driven prefetch cannot race a manual one. */
  const loadingRef = useRef(false)
  /**
   * The session's totals for the header. Re-read with every collect pass (open,
   * and each page the fill pulls in) rather than subscribed: the list itself is
   * a snapshot rebuilt the same way, and a settling turn moves these numbers no
   * more often than it moves the rows.
   */
  const [totals, setTotals] = useState<SessionTotals | null>(null)

  const active = useMemo(() => {
    if (activeId === null) return Math.max(0, entries.length - 1)
    const index = entries.findIndex(entry => entry.id === activeId)
    return index < 0 ? Math.max(0, entries.length - 1) : index
  }, [entries, activeId])

  const close = useCallback(() => { setOpen(false) }, [])

  /**
   * Publish a collected list, skipping the state update when nothing changed.
   *
   * The no-op guard is load-bearing, not an optimization: the fill loops call
   * this once per page, and the auto-fill effect re-runs on every new `entries`
   * reference. Without it, a page that adds no message would still produce a
   * fresh array, which would retrigger the effect, which would run another
   * fill — an unbounded loop on any session whose messages is not yet exhausted.
   * Identity is by id: `visible` only matters at open time, which recollects.
   */
  const applyEntries = useCallback((next: readonly MessageEntry[]) => {
    const current = entriesRef.current
    const same = current.length === next.length
      && current.every((entry, index) => entry.id === next[index]?.id)
    entriesRef.current = next
    if (!same) setEntries(next)
  }, [])

  /** Re-read the session totals the header shows; null when the host serves no projections. */
  const syncTotals = useCallback(() => { setTotals(sessionTotals()) }, [sessionTotals])

  const setActiveAt = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, entries.length - 1))
    setActiveId(entries[clamped]?.id ?? null)
  }, [entries])

  // The list is a snapshot of the rendered window: rebuild on every open so a
  // session that grew (or paged in) while closed is reflected.
  //
  // Where to land depends on where the reader is. Pinned to the bottom — the
  // state a freshly opened session follows itself into — they are on the newest
  // message, so highlight the last row; taking the first visible row there would
  // drop them at the top of a short transcript. Parked mid-list, they are
  // reading from the top edge of their viewport downward, so the first visible
  // row is the one to start from.
  const refresh = useCallback(() => {
    const { entries: next, pinnedToBottom } = collectMessages()
    applyEntries(next)
    syncTotals()
    const firstVisible = next.findIndex(entry => entry.visible)
    const target = pinnedToBottom ? Math.max(0, next.length - 1) : Math.max(0, firstVisible)
    setActiveId(next[target]?.id ?? null)
  }, [applyEntries, syncTotals])

  /**
   * Wait for the transcript to commit the rows a prepend just produced.
   * `loadOlder()` resolves when the store is updated, not when React has
   * rendered; collecting immediately would read the pre-prepend DOM.
   */
  const settle = useCallback((): Promise<void> => new Promise((resolve) => {
    requestAnimationFrame(() => { requestAnimationFrame(() => { resolve() }) })
  }), [])

  /**
   * Page older messages in until the list holds `minRows` entries.
   *
   * Pass `current + 1` to request exactly one more page — the loop condition is
   * a strict "fewer than", so once a page lands the target is already met.
   *
   * Two exits besides meeting the target: `hasMore()` going false (messages
   * exhausted), and {@link MAX_NO_PROGRESS} consecutive pages that add no row
   * (a tool-heavy stretch with none of our messages, or a broken page).
   */
  const fill = useCallback(async (minRows: number): Promise<void> => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      let stalled = 0
      while (entriesRef.current.length < minRows && hasMore() && stalled < MAX_NO_PROGRESS) {
        const before = entriesRef.current.length
        await loadOlder()
        await settle()
        const next = collectMessages().entries
        applyEntries(next)
        syncTotals()
        stalled = next.length > before ? 0 : stalled + 1
      }
    } finally {
      loadingRef.current = false
    }
  }, [applyEntries, hasMore, loadOlder, settle, syncTotals])

  // The chord: always armed, toggles the overlay, and suppresses the browser's
  // own binding (Ctrl+S is "save page" in every major browser). Pure toggle —
  // collecting the rows inside the updater would make them a render-phase
  // update, which React neither guarantees nor orders predictably.
  useEffect(() => onDocumentKeyDown((event) => {
    if (!matchesChord(event, config)) return
    event.preventDefault()
    event.stopPropagation()
    setOpen(current => !current)
  }), [config])

  // Collect on open. A layout effect rather than work inside the chord
  // handler: the transcript DOM is committed by then, so the viewport
  // measurement that picks the opening highlight reads final geometry, and
  // the reposition lands before the browser paints (no empty-list flash).
  useLayoutEffect(() => {
    if (!open) return
    refresh()
  }, [open, refresh])

  // Auto-fill on open. A freshly opened session shows only its tail window, so
  // the list would otherwise start shorter than the overlay can hold and the
  // paging keys would have nothing to page through. Re-runs as `entries` grows,
  // which is what carries the loop; `fill` itself stops on `hasMore` or on
  // repeated no-progress pages.
  useEffect(() => {
    if (!open) return
    if (entries.length >= config.maxRows) return
    void fill(config.maxRows)
  }, [open, entries, config.maxRows, fill])

  // Prefetch on approach to the oldest loaded row: the reader is about to page
  // past what we have, so pull the next page in before they get there.
  //
  // `+ 1` is "one more page", not a row count — the loop exits as soon as a
  // page lands. This cannot cascade for the same page: the highlight is held by
  // id, so prepending N rows moves its index up by N, out of the trigger zone.
  useEffect(() => {
    if (!open) return
    if (active > PREFETCH_AHEAD) return
    void fill(entries.length + 1)
  }, [open, active, entries, fill])

  // Navigation: armed only while open. Scrolling the highlight into the
  // listbox window is NOT done here — it lives in the effect below, which is
  // the single place that guarantees it for every path that moves `active`.
  useEffect(() => {
    if (!open) return undefined
    // Paging: Alt+Arrow, or the dedicated PageUp/PageDown keys. Both move one
    // listbox screenful. This must be tested BEFORE the plain Arrow branch —
    // Alt+ArrowDown still reports key === 'ArrowDown', so the single-step
    // branch below would otherwise swallow it.
    //
    // The highlight holds its visual position and the list scrolls under it,
    // rather than the highlight being dragged to an edge. Row height does not
    // depend on the active state (only the background changes), so the target
    // row's position can be measured before React re-renders.
    const page = (direction: 1 | -1): void => {
      const listbox = listboxRef.current
      if (listbox === null || entries.length === 0) return
      const step = pageStep(listbox)
      const to = Math.max(0, Math.min(active + direction * step, entries.length - 1))
      if (to === active) return
      const keep = rowOffset(listbox, active)
      const moved = rowOffset(listbox, to)
      setActiveAt(to)
      // Near either end the requested scrollTop runs past the range and the
      // browser clamps it, which is exactly the wanted edge behavior: the
      // highlight stays put mid-list and only shifts where it must.
      if (keep !== null && moved !== null) {
        listbox.scrollTop += moved - keep
      }
    }
    return onDocumentKeyDown((event) => {
      if (event.altKey && (event.key === 'ArrowDown' || event.key === 'PageDown')) {
        event.preventDefault()
        page(1)
        return
      }
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'PageUp')) {
        event.preventDefault()
        page(-1)
        return
      }
      if (event.key === 'PageDown') {
        event.preventDefault()
        page(1)
        return
      }
      if (event.key === 'PageUp') {
        event.preventDefault()
        page(-1)
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveAt(active + 1)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveAt(active - 1)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const entry = entries[active]
        if (entry === undefined) return
        const row = rowOf(entry.id)
        if (row !== null) landOnRow(row)
        setOpen(false)
      }
    })
  }, [open, entries, active])

  // Wheel over the list moves the highlight, one row per notch, exactly as
  // ArrowUp/ArrowDown do: the reader picks with the wheel and the list follows.
  // A native, non-passive listener is required — React registers `onWheel`
  // passively at the root, so `preventDefault` there could not stop the
  // listbox's own scroll, and a notched wheel would move the highlight and
  // scroll the rows at the same time. Reaching either end behaves like the
  // keyboard: the highlight clamps, and the prefetch above pulls in the older
  // page so a continued scroll keeps moving.
  useEffect(() => {
    if (!open) return undefined
    const listbox = listboxRef.current
    if (listbox === null || entries.length === 0) return undefined
    let travel = 0
    const step = (direction: 1 | -1): void => {
      setActiveId((current) => {
        const found = current === null ? -1 : entries.findIndex(entry => entry.id === current)
        const from = found < 0 ? entries.length - 1 : found
        const to = Math.max(0, Math.min(from + direction, entries.length - 1))
        return entries[to]?.id ?? null
      })
    }
    const onWheel = (event: WheelEvent): void => {
      if (event.deltaY === 0) return
      event.preventDefault()
      // Line- and page-mode deltas normalize to pixels, so one threshold means
      // one row whatever unit the device reports in.
      const delta = event.deltaMode === 1
        ? event.deltaY * 16
        : event.deltaMode === 2
          ? event.deltaY * listbox.clientHeight
          : event.deltaY
      travel += delta
      while (Math.abs(travel) >= WHEEL_STEP_PX) {
        const scrollingDown = travel > 0
        travel -= (scrollingDown ? 1 : -1) * WHEEL_STEP_PX
        // Direct by default — down scrolls to the newer row below — and
        // reversed for a device whose deltas read the other way.
        const direction: 1 | -1 = scrollingDown
          ? (config.wheelInverted ? -1 : 1)
          : (config.wheelInverted ? 1 : -1)
        step(direction)
      }
    }
    listbox.addEventListener('wheel', onWheel, { passive: false })
    return () => { listbox.removeEventListener('wheel', onWheel) }
  }, [open, entries, config.wheelInverted])

  // A shrinking list must never leave the highlight past its end.
  // Keep the highlight inside the listbox window for every path that moves it:
  // opening (the highlight is the first row visible in the transcript, which in
  // a long session sits far below the list window), Arrow navigation (which
  // pushes it past either edge), and paging in older messages (which rebuilds
  // the list around a new first-visible row). Mouse hover moves `active` too,
  // but that row is already under the pointer, so the overflow test no-ops.
  useEffect(() => {
    if (!open) return
    scrollRowIntoView(listboxRef.current, active)
  }, [open, entries, active])

  const jumpTo = (id: string): void => {
    const row = rowOf(id)
    if (row !== null) landOnRow(row)
    setOpen(false)
  }

  if (!open) return null

  // Which slice of the collected list the listbox renders. Row ids, the
  // `active` comparison, and every measurement below stay indexed against the
  // FULL list, so the highlight still addresses its own row once the window
  // slides away from index 0.
  const start = windowStart(active, entries.length, config.maxRows)

  return (
    <Dialog title={t('title')} closeLabel={t('closeLabel')} onClose={close}>
      <ListHeader totals={totals} count={entries.length} t={t} />
      {entries.length > 0 && (
        <div
          ref={listboxRef}
          role="listbox"
          aria-label={t('title')}
          aria-activedescendant={rowId(active)}
          style={LIST_STYLE}
        >
          {entries.slice(start, start + config.maxRows).map((entry, offset) => {
            const index = start + offset
            return (
              <MessageRow
                key={entry.id}
                entry={entry}
                index={index}
                active={index === active}
                onActivate={() => { setActiveAt(index) }}
                onJump={() => { jumpTo(entry.id) }}
                rowIdStr={rowId(index)}
              />
            )
          })}
        </div>
      )}
      <HintBar t={t} wheelInverted={config.wheelInverted} />
    </Dialog>
  )
}

const LIST_STYLE: CSSProperties = {
  // Positioned so this element is the rows' offsetParent: any future
  // offsetTop-based measurement stays local to the scroll container instead of
  // falling through to the dialog card.
  position: 'relative',
  maxHeight: 380,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  margin: '0 -6px',
  padding: '0 6px 2px',
}
