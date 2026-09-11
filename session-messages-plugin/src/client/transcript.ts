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

/**
 * A turn's usage and duration VALUES, as the host's tail pills render them (for
 * example `1.06k tok` and `21s`); both null when the turn carries neither.
 *
 * The value only — never the host's label in front of it. See
 * {@link valueOfLabel} for why the label is dropped.
 */
export interface TurnStats {
  readonly usage: string | null
  readonly duration: string | null
}

/** The empty reading, shared so callers can compare by identity. */
export const NO_TURN_STATS: TurnStats = { usage: null, duration: null }

/**
 * Identify a clock label leaf.
 *
 * ui-chat's `formatMessageClock` (in
 * `packages/client/ui-chat/src/client/chat/message-chrome.ts`) returns a bare
 * `HH:mm` for today, or `` `${md} ${HH:mm}` `` otherwise, where `md` comes from
 * the active locale's `clock.md` / `clock.ymd` TEMPLATE. Those templates are the
 * authority, so this mirrors them rather than guessing how a language writes a
 * date:
 *
 * | Locale | `clock.md` | `clock.ymd` |
 * |---|---|---|
 * | `zh` | `{m}月{d}日` | `{y}年{m}月{d}日` |
 * | `en` | `{m}/{d}` | `{y}-{m}-{d}` |
 *
 * Every other locale falls back to `en`, so those five shapes are everything the
 * host can print. An earlier version of this pattern was written against an
 * English form (`Mon D`) the host does not produce: it did not match `9/10
 * 20:16`, so the clock leaf was never stripped and the timestamp stayed glued to
 * the end of the message text — in both surfaces, since both read through here.
 *
 * The clock is REQUIRED on the date branches, which keeps a message that reads
 * like a bare date (`1/2`) from being mistaken for one. Strict full-string
 * match: a time-shaped fragment inside a sentence is intentionally not a
 * timestamp.
 */
const TIMESTAMP_PATTERN = /^(?:\d{1,2}:\d{2}|\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}|\d{4}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}|\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}|\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2})$/u

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
 * The value half of a host pill label: everything from its first digit on.
 *
 * The host renders `<label> <value>` — `Usage 1.06k tok`, `Ran for 21s` — and
 * the plugin keeps only the value, because the label cannot be trusted: the
 * shell ships `zh` and `en` alone (see `locales.ts`), so under a language-pack
 * locale the host falls back to English and `Usage 1.06k tok` lands in a
 * Japanese UI. Re-labelling with this plugin's own `turnUsage` / `turnDuration`
 * fixes that, while the number and its formatting still come from the host —
 * which is the part this plugin cannot derive: per-turn usage and wall time reach
 * a plugin only through a `conversation.chat.node` seat, and only for the single
 * turn that seat renders (see `session-totals.ts`).
 *
 * Slicing at the first digit is safe for the same reason the caller filters on
 * one: both host labels are a noun phrase followed by a number, and neither
 * noun phrase contains a digit.
 * @param label - the pill's trimmed text, known to contain a digit.
 * @returns the label's tail from that digit on.
 */
function valueOfLabel(label: string): string {
  const at = label.search(/\d/u)
  return at === -1 ? label : label.slice(at)
}

/**
 * Read one turn tail's usage and duration values.
 *
 * The host owns both the numbers and their formatting: a turn's tail already
 * carries a usage pill (`用量 1.06k tok` / `Usage 1.06k tok`) and a duration
 * pill (`用时 21s` / `Ran for 21s`), so this plugin reuses those numbers instead
 * of deriving tokens or wall time itself — but NOT their labels, which is what
 * {@link valueOfLabel} is about. The pills are plain buttons with hashed class
 * names, so they are located by contract position: the tail's LAST two
 * `aria-haspopup="dialog"` buttons are exactly the usage panel and the time
 * panel, in that order (TurnTailNodeView seats them after the branch action).
 * Their icons tell them apart — the usage pill draws an ellipse, the time pill
 * a circle. A pill hidden by the tail's hover-reveal keeps its text; opacity
 * does not remove it from the DOM.
 * @param tail - one `[data-turn-tail]` element.
 * @returns the values the tail carries, either of which may be null.
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
    const value = valueOfLabel(label)
    if (pill.querySelector('svg ellipse') !== null) usage = value
    else if (pill.querySelector('svg circle') !== null) duration = value
  }
  return usage === null && duration === null ? NO_TURN_STATS : { usage, duration }
}

/**
 * Read every rendered turn's stats, keyed by the turn's own id.
 * @param scroller - the transcript scrollport.
 * @returns the stats of every turn tail that carries at least one value.
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
