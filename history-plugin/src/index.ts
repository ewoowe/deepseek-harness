/**
 * Node half of the session-history plugin.
 *
 * The Loader imports this file by `main`. It owns the configuration Schema, so
 * a malformed `cordis.patch.yml` fails the plugin load loudly, and it publishes
 * the resolved values to the browser through the webserver's structured index
 * injection table — the boot graph carries no config of its own, so this global
 * is the supported channel from a Host plugin to its browser half.
 */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
// Type-only merge: pulls in the 'webserver/index-inject' event signature.
import type {} from '@deepseek-ai/dsh-host-webserver'
import { CONFIG_GLOBAL, DEFAULT_CONFIG, type HistoryConfig } from './shared.ts'

export const name = 'session-history'

/** Session-history plugin configuration. */
export interface Config extends HistoryConfig {}

/** Validated session-history configuration. */
export const Config: Schema<Config> = Schema.object({
  key: Schema.string().default(DEFAULT_CONFIG.key),
  ctrl: Schema.boolean().default(DEFAULT_CONFIG.ctrl),
  alt: Schema.boolean().default(DEFAULT_CONFIG.alt),
  shift: Schema.boolean().default(DEFAULT_CONFIG.shift),
  meta: Schema.boolean().default(DEFAULT_CONFIG.meta),
  maxRows: Schema.number().default(DEFAULT_CONFIG.maxRows),
})

/**
 * Publish the resolved configuration into every rendered index page.
 * @param ctx - Host plugin context.
 * @param config - validated configuration.
 */
export function apply(ctx: Context, config: Config): void {
  // The table is rebuilt per index render, so the row always carries the
  // current configuration — a live patch reload needs no separate signal.
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: CONFIG_GLOBAL, value: { ...config } })
  })
}
