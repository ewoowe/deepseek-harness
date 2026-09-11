/**
 * The transcript DOM contract, in one place.
 *
 * A third-party plugin cannot reach `ui-chat`'s node store, so every read goes
 * through attributes `ChatView` resolves its OWN scroll anchors with. That is
 * what makes them contracts rather than internals — breaking one would break
 * the host first:
 *
 * - `[data-conversation-scroll]` — the scrollport (ChatView's own `scrollerOf`).
 * - `[data-chat-flow-kind="user"|"steering"]` — one human message row.
 * - `[data-chat-anchor-key]` — the row's identity (ChatView restores scroll
 *   position by it).
 * - `[data-chat-turn]` — the turn the row belongs to.
 * - `[data-turn-tail]` — that turn's tail, which seats the usage and duration
 *   pills.
 *
 * Both consumers read through here — the overlay's list and the viewport HUD —
 * so the contract, the timestamp pattern and the pill geometry live in exactly
 * one place instead of drifting apart.
 */

/** The transcript's scrollport, or null when no conversation is mounted. */
export function scrollport(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-conversation-scroll]')
}

/** One human message row. Steering prompts are human turns too. */
export const MESSAGE_ROW_SELECTOR = '[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]'

/**
 * How much of a row must be inside the viewport before it counts as
 * "displayed". A row that only pokes a few pixels in is geometrically inside
 * the viewport but the reader has not reached it yet — the previous message is
 * still the one they are looking at. 30 px is roughly half a row to a full
 * row on the common chat density.
 */
export const VISIBLE_MIN_PX = 30

/**
 * Vertical breathing room a jump leaves above the row it lands on, matching
 * ChatView's own jump arithmetic (`scrollTop += row.top - scrollport.top - 24`).
 *
 * Shared rather than private to the overlay because it is also the width of the
 * band the viewport strip uses to decide which message the reader is on: a row
 * a jump just placed here is the row being read, even though its top edge sits
 * below the fold.
 */
export const LAND_OFFSET_PX = 24

/** A turn's usage and duration labels; both null when the turn carries neither. */
export interface TurnStats {
  readonly usage: string | null
  readonly duration: string | null
}

/** The empty reading, shared so callers can compare by identity. */
export const NO_TURN_STATS: TurnStats = { usage: null, duration: null }

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
 *
 * Cloning is the expensive part, so callers on a hot path (the HUD's scroll
 * reader) resolve the ONE row they need before calling this.
 */
export function splitEntry(row: HTMLElement): { text: string; timestamp: string | null } {
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
 * Read one turn tail's usage and duration labels.
 *
 * The host owns both the numbers and their formatting: a turn's tail already
 * carries a usage pill (`消费 1.2k` / `Consumed 1.2k`) and a duration pill
 * (`用时 12.3s` / `Ran for 12.3s`), localized by ui-chat, so this plugin reuses
 * those labels instead of deriving tokens or wall time itself. The pills are
 * plain buttons with hashed class names, so they are located by contract
 * position: the tail's LAST two `aria-haspopup="dialog"` buttons are exactly
 * the usage panel and the time panel, in that order (TurnTailNodeView seats
 * them after the branch action). Their icons tell them apart — the usage pill
 * draws an ellipse, the time pill a circle. A pill hidden by the tail's
 * hover-reveal keeps its text; opacity does not remove it from the DOM.
 * @param tail - one `[data-turn-tail]` element.
 * @returns the labels the tail carries, either of which may be null.
 */
export function turnStatsOfTail(tail: HTMLElement): TurnStats {
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
  return usage === null && duration === null ? NO_TURN_STATS : { usage, duration }
}

/**
 * Read every rendered turn's stats, keyed by the turn's own id.
 * @param scroller - the transcript scrollport.
 * @returns the stats of every turn tail that carries at least one label.
 */
export function collectTurnStats(scroller: HTMLElement): Map<string, TurnStats> {
  const stats = new Map<string, TurnStats>()
  for (const tail of scroller.querySelectorAll<HTMLElement>('[data-turn-tail]')) {
    const turn = tail.dataset.turnTail
    if (turn === undefined) continue
    const read = turnStatsOfTail(tail)
    if (read !== NO_TURN_STATS) stats.set(turn, read)
  }
  return stats
}

/**
 * Read one specific turn's stats without scanning the other tails.
 *
 * The HUD runs on every scroll frame and only ever needs the row it landed on,
 * so it resolves that turn's tail directly instead of building the whole map.
 * @param scroller - the transcript scrollport.
 * @param turn - the `data-chat-turn` value of the row in question.
 * @returns the turn's stats, or all-null when the turn renders no tail yet.
 */
export function turnStatsOfTurn(scroller: HTMLElement, turn: string | undefined): TurnStats {
  if (turn === undefined) return NO_TURN_STATS
  const tail = scroller.querySelector<HTMLElement>(`[data-turn-tail="${CSS.escape(turn)}"]`)
  return tail === null ? NO_TURN_STATS : turnStatsOfTail(tail)
}
