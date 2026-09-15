/**
 * What this session is doing right now, folded from its own event window.
 *
 * The unit is the STEP, not the turn: one model request plus the tool calls it
 * triggered. A turn is a prompt and its whole answer; a step is what the loop
 * actually repeats, and it is where "why is this taking so long" is answered —
 * a step is either waiting on the model or waiting on a tool, never both.
 *
 * Everything here comes from events the host already logs, and the pairing rules
 * are the log's own:
 *
 * - `step/start` opens a step and `step/end` closes it, so the difference of
 *   their `time` fields is the step's wall span with no clock read here.
 * - `tool/call` and `tool/result` are paired by the `callId` the result carries
 *   on `message.source.callId` — the same pairing `packages/core/session`'s own
 *   repair pass uses, so a call the host considers settled is settled here too.
 *
 * A step or call that never closed is reported as RUNNING rather than dropped:
 * that is the whole point of a live view, and it is also the honest answer for
 * the one turn that is currently in flight.
 *
 * Usage deliberately does NOT come from here. It comes from the host's own
 * browser-safe fold (`@deepseek-ai/dsh-token-meter/client`), the exact function
 * ui-chat builds a turn's tail with, so the two surfaces cannot disagree about
 * what a turn spent. That fold is defined over one COMPLETE turn and fails closed
 * for a running one, which is why a live turn reports its usage as null instead
 * of a partial sum.
 */
import { deriveTurnTokenUsage, type TurnTokenUsage } from '@deepseek-ai/dsh-token-meter/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { SessionEventLikeEntry, SessionEventSource } from '@deepseek-ai/dsh-api-session-controller/client'

/** The route one request went out on: which provider served it, and which model. */
export interface ModelRoute {
  readonly provider: string
  readonly model: string
}

/** One tool call, from the call that opened it to the result that settled it. */
export interface ToolCallFacts {
  /** The tool's own call id — the key both events agree on. */
  readonly callId: string
  /** The tool's registered name. */
  readonly name: string
  /** Seq of the `tool/call` event: stable identity across reorders. */
  readonly seq: number
  /** When the call started, epoch ms. */
  readonly startedAt: number
  /** Wall span in ms, or null while the call has not returned. */
  readonly elapsedMs: number | null
  /** Whether the call is still outstanding. */
  readonly running: boolean
  /** Whether the result carried an error. */
  readonly failed: boolean
}

/** One step: a single model request and the tool calls it produced. */
export interface StepFacts {
  /** Seq of the step's own `step/start`: its identity, and its stable key. */
  readonly seq: number
  /** The turn this step belongs to, as the log numbers turns. */
  readonly turn: number
  /** The step's index inside its turn. */
  readonly step: number
  /** When the step opened, epoch ms. */
  readonly startedAt: number
  /** Wall span in ms, or null while the step is open. */
  readonly elapsedMs: number | null
  /** Whether the step has not closed yet. */
  readonly running: boolean
  /** The step's tool calls, in the order they were made. */
  readonly tools: readonly ToolCallFacts[]
  /** The model this step's request ran on, or null before a reply names one. */
  readonly route: ModelRoute | null
}

/** One turn with its steps. */
export interface TurnLive {
  /** Seq of the turn's own `turn/start`. */
  readonly seq: number
  /** The turn's number as the log carries it. */
  readonly turn: number
  /** When the turn opened, epoch ms. */
  readonly startedAt: number
  /** Wall span in ms, or null while the turn is open. */
  readonly elapsedMs: number | null
  /** Whether the turn has not closed yet. */
  readonly running: boolean
  /** The turn's steps, oldest first. */
  readonly steps: readonly StepFacts[]
  /** The turn's folded usage, or null while it is incomplete or running. */
  readonly usage: TurnTokenUsage | null
  /** The last route the turn's own fold attributes to it, or null. */
  readonly route: ModelRoute | null
  /** The prompt that opened the turn, or null when the window lost it. */
  readonly prompt: string | null
}

/** A tool call still waiting for its result, as the fold tracks it. */
interface OpenCall {
  readonly seq: number
  readonly name: string
  readonly startedAt: number
}

/** A step still being built. */
interface StepBuilder {
  readonly seq: number
  readonly turn: number
  readonly step: number
  readonly startedAt: number
  closedAt: number | null
  readonly tools: ToolCallFacts[]
  readonly open: Map<string, OpenCall>
  route: ModelRoute | null
}

/** A turn still being built. */
interface TurnBuilder {
  readonly seq: number
  readonly turn: number
  readonly startedAt: number
  closedAt: number | null
  /** The turn's own events, `turn/start` → `turn/end`, for the usage fold. */
  readonly events: SessionEvent[]
  readonly steps: StepBuilder[]
  prompt: string | null
}

/**
 * Fold one loaded event window into turns, each carrying its steps and tools.
 *
 * The nesting mirrors the log: a turn opens with `turn/start` and closes with
 * `turn/end`; inside it, steps open and close the same way; inside a step, tool
 * calls open and close on `tool/call` / `tool/result`. Each level's span is the
 * difference of its own boundary timestamps, so nothing here reads a clock and a
 * running level reports null rather than a number that would go stale on screen.
 *
 * @param entries - one `SessionEventWindow['entries']`.
 * @returns every turn the window carries, oldest first. A turn with no evidence
 *   of its own is absent rather than empty.
 */
export function foldLiveTurns(entries: readonly SessionEventLikeEntry[]): readonly TurnLive[] {
  const turns: TurnBuilder[] = []
  let turn: TurnBuilder | null = null
  let step: StepBuilder | null = null
  let pendingPrompt: string | null = null

  for (const entry of entries) {
    // Client-only live chunks are presentation, not evidence: they carry no
    // boundary, no result and no billed usage, so they cannot move a figure.
    if (entry.type !== 'event') continue
    const event = entry.event

    if (event.type === 'user/message') {
      // A prompt is appended BEFORE the `turn/start` that answers it, so it is
      // claimed rather than pushed: an open turn takes it, and one seen between
      // turns is held for the next. Only a message the reader typed may SET it —
      // injected context arrives through the same event type and normally lands
      // after the prompt, so overwriting on those would label every row with a
      // system reminder instead of what was asked.
      const typed = promptOf(event.data)
      if (typed !== null) {
        if (turn === null) pendingPrompt = typed
        else turn.prompt = typed
      }
      continue
    }

    if (event.type === 'turn/start') {
      // Keyed by the start event's SEQ, never by its turn number: numbers repeat
      // across spliced segments and a fork, and a number-keyed map merges two
      // turns into one slice the usage fold then rejects outright.
      turn = {
        seq: event.seq,
        turn: event.data.turn,
        startedAt: event.time,
        closedAt: null,
        events: [event],
        steps: [],
        prompt: pendingPrompt,
      }
      pendingPrompt = null
      step = null
      turns.push(turn)
      continue
    }

    // Everything below is inside a turn. A stray event before the first
    // `turn/start` belongs to no slice the product can name.
    if (turn === null) continue
    turn.events.push(event)

    if (event.type === 'step/start') {
      step = {
        seq: event.seq,
        turn: event.data.turn,
        step: event.data.step,
        startedAt: event.time,
        closedAt: null,
        tools: [],
        open: new Map(),
        route: null,
      }
      turn.steps.push(step)
      continue
    }

    if (event.type === 'turn/end') {
      turn.closedAt = event.time
      turn = null
      step = null
      continue
    }

    // The step is the only thing that can carry a tool call. `step/end` clears
    // it, so anything after the step that is not a boundary is simply not tool
    // evidence and is skipped rather than attributed to the wrong step.
    if (step === null) continue

    switch (event.type) {
      case 'step/end':
        step.closedAt = event.time
        step = null
        break
      case 'tool/call':
        step.open.set(event.data.callId, {
          seq: event.seq,
          name: event.data.name,
          startedAt: event.time,
        })
        break
      case 'tool/result': {
        const callId = event.data.message.source.callId
        const open = step.open.get(callId)
        // A result with no matching call is legal: the host's repair pass
        // synthesizes one for a call that never started, so it is reported
        // without a start of its own rather than dropped as unmatched.
        step.tools.push({
          callId,
          name: open?.name ?? callId,
          seq: open?.seq ?? event.seq,
          startedAt: open?.startedAt ?? event.time,
          elapsedMs: open === undefined ? null : Math.max(0, event.time - open.startedAt),
          running: false,
          failed: event.data.message.content[0]?.isError === true,
        })
        step.open.delete(callId)
        break
      }
      case 'assistant/message': {
        const route = routeOfMessage(event.data)
        if (route !== null) step.route = route
        break
      }
      default:
        break
    }
  }

  return turns.map(finishTurn)
}

/** Close out one turn builder into its facts, including any still-open step. */
function finishTurn(turn: TurnBuilder): TurnLive {
  const steps = turn.steps.map(finishStep)
  const usage = deriveTurnTokenUsage(turn.events) ?? null
  return {
    seq: turn.seq,
    turn: turn.turn,
    startedAt: turn.startedAt,
    elapsedMs: turn.closedAt === null ? null : Math.max(0, turn.closedAt - turn.startedAt),
    running: turn.closedAt === null,
    steps,
    usage,
    // The host's own fold first — it is what a turn's usage dialog shows, and a
    // retry's message can be logged before the retry, which is how a turn that
    // finished on one model read as another. The steps' own messages are the
    // fallback for a turn the fold cannot finish yet.
    route: lastRouteOf(usage) ?? lastStepRoute(steps),
    prompt: turn.prompt,
  }
}

/** Close out one step builder, keeping its outstanding calls as running rows. */
function finishStep(step: StepBuilder): StepFacts {
  const tools: ToolCallFacts[] = [...step.tools]
  // A live view that hid an in-flight call would show a step with no tools while
  // the transcript beside it shows one running — the exact disagreement this
  // plugin exists to avoid.
  for (const [callId, open] of step.open) {
    tools.push({
      callId,
      name: open.name,
      seq: open.seq,
      startedAt: open.startedAt,
      elapsedMs: null,
      running: true,
      failed: false,
    })
  }
  // Sorted by the opening event's seq, so a settled call cannot jump ahead of
  // one that started before it just because it finished first.
  tools.sort((left, right) => left.seq - right.seq)
  return {
    seq: step.seq,
    turn: step.turn,
    step: step.step,
    startedAt: step.startedAt,
    elapsedMs: step.closedAt === null ? null : Math.max(0, step.closedAt - step.startedAt),
    running: step.closedAt === null,
    tools,
    route: step.route,
  }
}

/** The last step that named a model, or null when none did. */
function lastStepRoute(steps: readonly StepFacts[]): ModelRoute | null {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const route = steps[index]?.route
    if (route !== null && route !== undefined) return route
  }
  return null
}

/** The `user/message` payload fields this module reads. */
interface UserMessageData {
  readonly content?: readonly { readonly text?: unknown }[]
  readonly source?: { readonly kind?: unknown }
}

/**
 * The text of one reader-typed user message, or null when the event is not one.
 *
 * A log carries more user-role messages than the reader wrote — injected context
 * arrives the same way — and `MessageSourceMap.user` is exactly
 * `{ kind: 'user' }`, so the source is the discriminator and the text is not.
 * Blocks without a `text` string (images, files) contribute nothing, so a prompt
 * made only of those reads as null rather than as an empty string.
 * @param data - a `user/message` event's payload.
 * @returns the prompt text, trimmed, or null.
 */
function promptOf(data: unknown): string | null {
  const payload = data as UserMessageData
  if (payload.source?.kind !== 'user') return null
  const blocks = payload.content
  if (!Array.isArray(blocks)) return null
  let text = ''
  for (const block of blocks) {
    if (typeof block?.text === 'string') text += block.text
  }
  const trimmed = text.trim()
  return trimmed === '' ? null : trimmed
}

/** The `assistant/message` payload fields this module reads. */
interface AssistantMessageData {
  readonly message?: { readonly source?: { readonly provider?: unknown; readonly model?: unknown } }
}

/**
 * The route one assistant message reports, or null when it names no model.
 * @param data - an `assistant/message` event's payload.
 * @returns the route, or null.
 */
function routeOfMessage(data: unknown): ModelRoute | null {
  const source = (data as AssistantMessageData).message?.source
  const model = source?.model
  if (typeof model !== 'string' || model === '') return null
  return { provider: typeof source?.provider === 'string' ? source.provider : '', model }
}

/**
 * The last route the host's own fold attributes to a turn, or null.
 *
 * `TurnTokenUsage.routes` lists the attempts a turn made and is what the turn's
 * usage dialog displays, so reading it here is what keeps the two surfaces
 * agreeing rather than deriving a second answer from the same events.
 * @param usage - the turn's folded usage, or null while it is incomplete.
 * @returns the final route, or null when the fold named none.
 */
function lastRouteOf(usage: TurnTokenUsage | null): ModelRoute | null {
  const route = usage?.routes?.at(-1)
  if (route === undefined) return null
  return {
    provider: typeof route.provider === 'string' ? route.provider : '',
    model: route.model,
  }
}

/**
 * Build the fold over one event source, re-running it only when the window moved.
 *
 * The fold is O(events) and a live view redraws on every event, so redoing it per
 * render would make the session's own logging stall the surface reporting it.
 * `revision` is the window's own change counter, so one integer comparison
 * answers "has anything moved" — and because `entries` is a lazily materialised
 * getter, an unchanged revision does not even pay for the list.
 * @param source - the binding's event source.
 * @returns a function yielding every turn, valid until the window moves.
 */
function memoisedFold(source: SessionEventSource): () => readonly TurnLive[] {
  let revision = -1
  let turns: readonly TurnLive[] = []
  return () => {
    const window = source.getSnapshot()
    if (window.revision !== revision) {
      revision = window.revision
      turns = foldLiveTurns(window.entries)
    }
    return turns
  }
}

/**
 * One fold per event source.
 *
 * Keyed weakly by the source rather than held in a field, so a binding that goes
 * away takes its fold with it.
 */
const folds = new WeakMap<SessionEventSource, () => readonly TurnLive[]>()

/** One line of the live event stream: what was logged, and when. */
export interface StreamLine {
  /** React key: event type plus seq, unique within a window. */
  readonly key: string
  /** The event's own sequence number. */
  readonly seq: number
  /** When it was logged, epoch ms. */
  readonly time: number
  /** The event type, as the log spells it. */
  readonly type: string
  /** The one thing about this event worth reading in a one-line row. */
  readonly detail: string
}

/**
 * The newest events, newest first, for the stream pane.
 *
 * Reads the window's tail rather than the fold, because the stream is about what
 * the LOG did, not about turns: an event that belongs to no step — a retry, a
 * compaction, a title rewrite — is exactly the kind of thing a live view exists
 * to show, and the fold would silently drop it.
 *
 * Client-only transient chunks are included and marked, since "the model is
 * streaming right now" is the single most useful thing this pane can say.
 * @param entries - one `SessionEventWindow['entries']`.
 * @param limit - maximum lines to return.
 * @returns the newest lines, newest first.
 */
export function streamOf(entries: readonly SessionEventLikeEntry[], limit: number): readonly StreamLine[] {
  const lines: StreamLine[] = []
  for (let index = entries.length - 1; index >= 0 && lines.length < limit; index -= 1) {
    const entry = entries[index]
    if (entry === undefined) continue
    if (entry.type === 'transient') {
      const chunk = entry.event
      lines.push({
        key: `chunk:${chunk.seq}`,
        seq: chunk.seq,
        time: chunk.time,
        type: 'assistant/live-chunk',
        detail: `turn ${chunk.data.turn} · step ${chunk.data.step}`,
      })
      continue
    }
    const event = entry.event
    lines.push({
      key: `${event.type}:${event.seq}`,
      seq: event.seq,
      time: event.time,
      type: event.type,
      detail: detailOf(event),
    })
  }
  return lines
}

/**
 * The one field worth showing beside an event's type.
 *
 * Deliberately shallow: this is a `tail -f` line, not a payload inspector. A
 * field is picked because it identifies the event — which tool, which model,
 * which turn — not because it is interesting.
 * @param event - the event to describe.
 * @returns a short description, or the empty string when the type says enough.
 */
function detailOf(event: SessionEvent): string {
  switch (event.type) {
    case 'step/start':
    case 'step/end':
      return `turn ${event.data.turn} · step ${event.data.step}`
    case 'turn/start':
    case 'turn/end':
      return `turn ${event.data.turn}`
    case 'tool/call':
      return event.data.name
    case 'tool/result':
      return event.data.message.source.callId
    case 'assistant/message': {
      const source = (event.data as AssistantMessageData).message?.source
      return typeof source?.model === 'string' ? source.model : ''
    }
    default:
      return ''
  }
}

/**
 * Every turn and step for one session binding.
 * @param source - the binding's event source.
 * @returns a lookup, reused across calls for the same source.
 */
export function liveTurnsOf(source: SessionEventSource): () => readonly TurnLive[] {
  const existing = folds.get(source)
  if (existing !== undefined) return existing
  const fold = memoisedFold(source)
  folds.set(source, fold)
  return fold
}
