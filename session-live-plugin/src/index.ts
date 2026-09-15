/**
 * Node half of the session-live plugin.
 *
 * It contributes no services and no configuration. The view reads what the
 * client already publishes — projections for context occupancy and session
 * totals, the session's own event window for the per-step and per-tool detail —
 * so there is nothing to configure, and nothing to fetch from this side.
 *
 * The module exists because a `dsh.bundle` layer inserts a Loader row by package
 * name, and that row has to resolve. `apply` is therefore the identity of a
 * plugin whose whole work happens on the other half.
 */

/** Plugin id, shared with the client half's module-loader handoff and the patch. */
export const name = 'session-live'

/** Nothing to install on the Node side; see the module doc. */
export function apply(): void {
  // Intentionally empty.
}
