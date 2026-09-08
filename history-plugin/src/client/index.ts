/**
 * Browser half of the message-history plugin.
 *
 * Mounts the overlay into the `shell.overlay` slot — a frame-wide, click-through
 * floating layer declared by ui-layout — and hands it the one action it needs.
 * The component never sees a Cordis context: paging goes through the
 * registration's inject face.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only merges: these pull in ctx.slots and ctx.sessions.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { HistoryOverlaySlot } from './overlay.tsx'
import { en, zh, type HistoryKey } from './locales.ts'

/** Locale namespace owning the overlay copy. */
const NS = 'sessionHistory'

/** Services required before the overlay can register. */
export const inject = ['slots', 'sessions', 'locale']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    sessionHistory: HistoryKey
  }
}

/**
 * Install the overlay.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-history: dictionaries')

  ctx.inject(['slots', 'sessions', 'locale'], (scope: ClientContext) => {
    scope.slots.inject('shell.overlay', () => scope.slots.register({
      name: 'shell.overlay',
      id: 'session-history',
      order: 100,
      label: 'Session history',
      locale: NS,
      inject: () => ({
        // Page one earlier history window in through the current session's
        // own face; the overlay rebuilds its list from the new DOM.
        loadOlder: async (): Promise<void> => {
          const current = scope.sessions.list.getSnapshot().current
          if (current === undefined) return
          await scope.sessions.binding(current)?.session.loadOlder()
        },
      }),
    }, HistoryOverlaySlot))
  })
}
