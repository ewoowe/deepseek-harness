/**
 * Browser half of the session-messages plugin.
 *
 * Mounts the overlay into the `shell.overlay` slot — a frame-wide, click-through
 * floating layer declared by ui-layout — and contributes a settings card to
 * the Settings → Plugins → Plugin configuration page. The overlay never sees a
 * Cordis context: paging goes through the registration's inject face, and the
 * chord and `maxRows` are read from the `session-messages` settings scope.
 *
 * This file is `.ts`, not `.tsx`, on purpose: the rolldown/oxc JSX parser
 * trips over `SettingsScope<MessagesConfig>` whenever a generic-typed symbol
 * sits near a JSX element in cjs output. `React.createElement` keeps the
 * shape legible without paying that price.
 */
import { createElement, type ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only merges: pull in ctx.slots, ctx.sessions, ctx.settingsScope.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Declares the 'shell.overlay' slot the overlay registers into; without this
// merge the slot name is not in SlotMap and the register below fails to compile.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { MessagesOverlaySlot, type MessagesOverlaySlotProps } from './overlay.tsx'
import { MessagesSettingsCard } from './settings-card.tsx'
import { readSessionTotals, type SessionTotals } from './session-totals.ts'
import { publishScope } from './settings-scope-holder.ts'
import type { MessagesConfig } from '../shared.ts'
import { en, zh, type MessagesKey } from './locales.ts'

/** Locale namespace owning the overlay and settings card copy. */
const NS = 'sessionMessages'

/** Settings namespace shared with the Node half (see `SETTINGS_NAMESPACE` in src/index.ts). */
const SETTINGS_NAMESPACE = 'session-messages'

/**
 * Services required before the overlay can register.
 *
 * `settingsScope` is deliberately NOT here. A module-level entry keeps the
 * whole plugin unmounted on any host without that service — the overlay would
 * disappear to gain a card. The card is registered through a nested inject
 * instead, so on such a host it simply never appears and everything else
 * keeps working.
 */
export const inject = ['slots', 'sessions', 'locale']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    sessionMessages: MessagesKey
  }
}

/** Bound settings scope for `session-messages`. */
type MessagesScope = SettingsScope<MessagesConfig>

/**
 * The host surface the nested `settingsScope` inject hands back. Declared
 * structurally: the host supplies the real Context, and naming only what is
 * touched keeps this external package free of monorepo-internal types.
 */
interface SettingsScopeHost {
  settingsScope: { bind<T>(spec: { namespace: string }): MessagesScope }
  slots: {
    inject(name: string, register: () => unknown): void
    register(options: Record<string, unknown>, render: (props: never) => unknown): unknown
  }
  locale: { bind(namespace: string): (key: MessagesKey, params?: Record<string, unknown>) => string }
}

/** Render the settings card given the slot's standard props. */
function renderSettingsEntry(
  props: { t: (key: MessagesKey, params?: Record<string, unknown>) => string },
  scope: MessagesScope,
): ReactNode {
  // `scope`, not `settingsScope`: that is the prop name the card declares. A
  // mismatch here leaves `props.scope` undefined and the card throws inside the
  // slot's error boundary on its first `scope.getSnapshot()` — it never renders.
  return createElement(MessagesSettingsCard, { scope, t: props.t })
}

/**
 * Install the overlay and the settings card.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-messages: dictionaries')

  ctx.inject(['slots', 'sessions', 'locale'], (scope: ClientContext) => {
    // The overlay needs only `sessions`; it reads its own configuration from
    // the settings scope through the holder, falling back to the index-page
    // global until that scope is bound.
    scope.slots.inject('shell.overlay', () => scope.slots.register({
      name: 'shell.overlay',
      id: 'session-messages',
      order: 100,
      label: 'Session messages',
      locale: NS,
      inject: () => ({
        // Page one earlier messages window in through the current session's
        // own face; the overlay rebuilds its list from the new DOM.
        loadOlder: async (): Promise<void> => {
          const current = scope.sessions.list.getSnapshot().current
          if (current === undefined) return
          await scope.sessions.binding(current)?.session.loadOlder()
        },
        // Whether older messages remains. Without this the auto-fill loop could
        // never tell "exhausted" from "server is slow" and would spin.
        hasMore: (): boolean => {
          const current = scope.sessions.list.getSnapshot().current
          if (current === undefined) return false
          return scope.sessions.binding(current)?.session.getSnapshot().hasMore === true
        },
        // The session's own totals, read from its projection faces. A
        // composition without either projection unit returns null, and the
        // overlay simply renders no header stats instead of zeros.
        sessionTotals: (): SessionTotals | null => {
          const current = scope.sessions.list.getSnapshot().current
          if (current === undefined) return null
          const session = scope.sessions.binding(current)?.session
          return session === undefined ? null : readSessionTotals(session.projections)
        },
      }),
    }, (props: MessagesOverlaySlotProps) => createElement(MessagesOverlaySlot, props)))
  })

  // The settings card, behind a nested inject: on a host with no
  // `settingsScope` service the callback never runs and no card appears,
  // instead of the whole plugin failing to mount.
  const settingsCtx = ctx as unknown as {
    inject(services: string[], callback: (scoped: SettingsScopeHost) => void): void
  }
  settingsCtx.inject(['settingsScope'], (scoped) => {
    const bound = scoped.settingsScope.bind<MessagesConfig>({ namespace: SETTINGS_NAMESPACE })
    // Published for the overlay, which mounted earlier and is already
    // subscribed to the holder.
    publishScope(bound)
    scoped.slots.inject('settings.plugin.item', () => scoped.slots.register({
      name: 'settings.plugin.item',
      // The card's key is the settings namespace: that is the only thing the
      // tab uses to pair a Host-served namespace with the card that edits it.
      key: SETTINGS_NAMESPACE,
      locale: NS,
      inject: () => ({
        t: scoped.locale.bind(NS),
      }),
    }, (props: { t: (key: MessagesKey, params?: Record<string, unknown>) => string }) =>
      renderSettingsEntry(props, bound)))
  })
}
