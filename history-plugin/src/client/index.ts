/**
 * Browser half of the message-history plugin.
 *
 * Mounts the overlay into the `shell.overlay` slot — a frame-wide, click-through
 * floating layer declared by ui-layout — and contributes a settings card to
 * the Settings → Plugins → Plugin configuration page. The overlay never sees a
 * Cordis context: paging goes through the registration's inject face, and the
 * chord and `maxRows` are read from the `session-history` settings scope.
 *
 * This file is `.ts`, not `.tsx`, on purpose: the rolldown/oxc JSX parser
 * trips over `SettingsScope<HistoryConfig>` whenever a generic-typed symbol
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
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { HistoryOverlaySlot, type HistoryOverlaySlotProps } from './overlay.tsx'
import { HistorySettingsCard } from './settings-card.tsx'
import { publishScope } from './settings-scope-holder.ts'
import type { HistoryConfig } from '../shared.ts'
import { en, zh, type HistoryKey } from './locales.ts'

/** Locale namespace owning the overlay and settings card copy. */
const NS = 'sessionHistory'

/** Settings namespace shared with the Node half (see `SETTINGS_NAMESPACE` in src/index.ts). */
const SETTINGS_NAMESPACE = 'session-history'

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
    sessionHistory: HistoryKey
  }
}

/** Bound settings scope for `session-history`. */
type HistoryScope = SettingsScope<HistoryConfig>

/**
 * The host surface the nested `settingsScope` inject hands back. Declared
 * structurally: the host supplies the real Context, and naming only what is
 * touched keeps this external package free of monorepo-internal types.
 */
interface SettingsScopeHost {
  settingsScope: { bind<T>(spec: { namespace: string }): HistoryScope }
  slots: {
    inject(name: string, register: () => unknown): void
    register(options: Record<string, unknown>, render: (props: never) => unknown): unknown
  }
  locale: { bind(namespace: string): (key: HistoryKey, params?: Record<string, unknown>) => string }
}

/** Render the settings card given the slot's standard props. */
function renderSettingsEntry(
  props: { t: (key: HistoryKey, params?: Record<string, unknown>) => string },
  scope: HistoryScope,
): ReactNode {
  // `scope`, not `settingsScope`: that is the prop name the card declares. A
  // mismatch here leaves `props.scope` undefined and the card throws inside the
  // slot's error boundary on its first `scope.getSnapshot()` — it never renders.
  return createElement(HistorySettingsCard, { scope, t: props.t })
}

/**
 * Install the overlay and the settings card.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-history: dictionaries')

  ctx.inject(['slots', 'sessions', 'locale'], (scope: ClientContext) => {
    // The overlay needs only `sessions`; it reads its own configuration from
    // the settings scope through the holder, falling back to the index-page
    // global until that scope is bound.
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
        // Whether older history remains. Without this the auto-fill loop could
        // never tell "exhausted" from "server is slow" and would spin.
        hasMore: (): boolean => {
          const current = scope.sessions.list.getSnapshot().current
          if (current === undefined) return false
          return scope.sessions.binding(current)?.session.getSnapshot().hasMore === true
        },
      }),
    }, (props: HistoryOverlaySlotProps) => createElement(HistoryOverlaySlot, props)))
  })

  // The settings card, behind a nested inject: on a host with no
  // `settingsScope` service the callback never runs and no card appears,
  // instead of the whole plugin failing to mount.
  const settingsCtx = ctx as unknown as {
    inject(services: string[], callback: (scoped: SettingsScopeHost) => void): void
  }
  settingsCtx.inject(['settingsScope'], (scoped) => {
    const bound = scoped.settingsScope.bind<HistoryConfig>({ namespace: SETTINGS_NAMESPACE })
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
    }, (props: { t: (key: HistoryKey, params?: Record<string, unknown>) => string }) =>
      renderSettingsEntry(props, bound)))
  })
}
