/**
 * Browser half of the session-live plugin.
 *
 * One contribution: a conversation view reporting what the session is doing right
 * now. It needs three seams — `slots` to register the view, `sessions` to reach
 * the viewing session's own event window and projections, and `locale` for its
 * copy — and it takes `conversation` separately, because that service owns the
 * composer block this view raises while it is on screen.
 *
 * No `remote` and no model catalogue: this view prints the model ids the session
 * itself logged, so it stays useful on a host whose catalogue layer is absent.
 */
import { createElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
// `SessionSeq` is a value: the branded constructor the jump loader takes.
import { SessionSeq, type SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only merges: these pull in ctx.slots, ctx.sessions and ctx.conversation.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { LiveView, type LiveSnapshot, type LiveViewInjected, type LiveViewProps } from './LiveView.tsx'
import { liveTurnsOf, streamOf } from './live-facts.ts'
import { readOccupancy, readTotals, type ProjectionsFaceLike } from './live-projection.ts'
import { en, NS, zh } from './locales.ts'

/** How many stream lines one snapshot carries. */
const MAX_STREAM = 60

/**
 * Services required before anything registers.
 *
 * A module-level declaration, not just the nested scope below, because `apply`
 * touches `locale` OUTSIDE that scope: the dictionaries have to register before
 * any slot resolves a string. Cordis refuses a property read on a service the
 * plugin never declared, and the failure mode is not a missing label but a plugin
 * that fails to apply at all.
 */
export const inject = ['slots', 'sessions', 'locale', 'conversation']

/** What a session with no binding reports: nothing, and stably so. */
const EMPTY_SNAPSHOT: LiveSnapshot = {
  revision: 0,
  turns: [],
  occupancy: null,
  totals: null,
  hasMore: false,
  stream: [],
}

/**
 * One session's read face.
 *
 * The object is created ONCE per session and cached by the caller. That identity
 * is load-bearing rather than an optimisation: the view's effect keys on
 * `subscribe` and `snapshot`, so a face rebuilt per render would rebind its
 * subscriptions on every render, and each rebind publishes immediately — a loop.
 *
 * `snapshot()` returns the SAME object while nothing it draws from moved, for the
 * same reason: the view holds it in state, and React compares by reference.
 * @param sessionId - the session this face reads.
 * @param scope - the injected client context.
 * @returns the face the view registration injects.
 */
function createFace(sessionId: string, scope: Context): LiveViewInjected {
  // Resolved per read rather than captured: a view can outlive a reconnect, and a
  // captured binding would keep reading the dead one.
  const bindingOf = (): ReturnType<typeof scope.sessions.binding> =>
    scope.sessions.binding(sessionId as SessionId)

  // The last snapshot, with the four references it was built from. Four
  // comparisons decide whether anything moved — and because the projections'
  // `getSnapshot` is identity-stable and the event window carries its own
  // revision, they are exact rather than heuristic.
  let source: unknown
  let revision = -1
  let pressure: unknown
  let stats: unknown
  let usage: unknown
  let cached: LiveSnapshot | undefined

  const snapshot = (): LiveSnapshot => {
    const binding = bindingOf()
    if (binding === undefined) return EMPTY_SNAPSHOT
    const window = binding.eventSource.getSnapshot()
    const projections = binding.session.projections as unknown as ProjectionsFaceLike
    const nextPressure = projections.faceOf('contextPressure').getSnapshot()
    const nextStats = projections.faceOf('sessionStats').getSnapshot()
    const nextUsage = projections.faceOf('tokenUsage').getSnapshot()
    if (cached !== undefined
      && source === binding.eventSource
      && revision === window.revision
      && pressure === nextPressure
      && stats === nextStats
      && usage === nextUsage) {
      return cached
    }
    source = binding.eventSource
    revision = window.revision
    pressure = nextPressure
    stats = nextStats
    usage = nextUsage
    cached = {
      revision: window.revision,
      turns: liveTurnsOf(binding.eventSource)(),
      occupancy: readOccupancy(projections),
      totals: readTotals(projections),
      hasMore: window.hasMore,
      stream: streamOf(window.entries, MAX_STREAM),
    }
    return cached
  }

  return {
    sessionId,
    subscribe: (listener) => {
      const binding = bindingOf()
      // No binding yet is not an error: the view is registered before the
      // session's binding exists on some boots, and the view's own tick picks it
      // up as soon as it appears.
      return binding === undefined ? () => {} : binding.eventSource.subscribe(listener)
    },
    snapshot,
    hasOlder: () => bindingOf()?.session.getSnapshot().hasMore === true,
    loadAll: async (): Promise<void> => {
      const binding = bindingOf()
      if (binding === undefined) return
      // The host's own jump loader, aimed at the beginning of the session. It
      // pages backwards until the window covers the target and already carries
      // the no-progress guard a hand-rolled loop has to invent, and its pages are
      // four times larger than `loadOlder`'s — 200 messages against 50.
      await binding.session.loadThrough(SessionSeq(0))
    },
    blockComposer: (reason) => {
      // `conversation.blocks` is the shell's own single-slot registry for "why
      // this session's composer is inert"; `undefined` clears it.
      scope.conversation.blocks.set(
        sessionId as SessionId,
        reason === null ? undefined : { reason },
      )
    },
  }
}

/**
 * Register the view.
 * @param ctx - owning client context.
 */
export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    'session-live: dictionaries',
  )

  ctx.inject(['slots', 'sessions', 'locale'], (scope: Context) => {
    // Bound once, resolved per read: `bind` reads the ACTIVE locale at call time,
    // so the tab label follows a locale switch without re-registering.
    const t = scope.locale.bind(NS)

    // Cached so the view's subscriptions bind once per session; see `createFace`.
    const faces = new Map<string, LiveViewInjected>()
    const faceOf = (sessionId: string): LiveViewInjected => {
      const existing = faces.get(sessionId)
      if (existing !== undefined) return existing
      const face = createFace(sessionId, scope)
      faces.set(sessionId, face)
      return face
    }

    scope.slots.inject('conversation.view', () => scope.slots.register({
      name: 'conversation.view',
      id: 'live',
      // Ahead of the usage view: this is the surface for "what is happening",
      // and it is the one a reader wants while a turn is still running.
      order: 9,
      locale: NS,
      label: () => t('title'),
      inject: faceOf,
    }, (props: LiveViewProps) => createElement(LiveView, props)))
  })
}
