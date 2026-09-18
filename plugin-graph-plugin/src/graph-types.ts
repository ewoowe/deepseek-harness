/**
 * The dependency graph's wire shape, shared by both halves.
 *
 * A separate module rather than types living in the Node half: the browser bundle
 * cannot import `src/index.ts` (that module pulls in cordis and the webserver's
 * Node-side types), and restating the shape on the browser side is exactly how two
 * definitions of one wire format start to drift.
 *
 * Types only, plus the one path constant both halves must agree on.
 */

/** Path the graph is served at, shared so neither half restates it. */
export const GRAPH_PATH = '/dsh-plugin-graph'

/**
 * Path of the standalone viewer page.
 *
 * Served by the Node half as a whole document rather than by the module loader,
 * because its whole point is to escape the settings panel: an iframe or a route
 * inside the app would inherit the same width the reader is trying to get away
 * from.
 */
export const VIEWER_PATH = '/dsh-plugin-graph/view'

/** Path of the viewer's script, served beside its page and referenced by it. */
export const VIEWER_SCRIPT_PATH = '/dsh-plugin-graph/viewer.js'

/**
 * One service a plugin injects, and what its declaration gates.
 *
 * A plugin can acquire services two ways, and the difference is not cosmetic:
 *
 * - declared on the plugin itself (`export const inject = [...]`, an entry
 *   `inject:` option, or the `@Inject` decorator) — the fiber stays pending
 *   until every one of them resolves, so the plugin does not load without them;
 * - acquired at runtime through the `ctx.inject(deps, callback)` helper — the
 *   callback runs once they appear, so the plugin loads either way and only
 *   that contribution waits.
 *
 * Both are real dependencies and both get edges. `optional` carries which kind,
 * because a missing required service is a broken composition while a missing
 * optional one is the ordinary case the callback form exists for.
 */
export interface GraphInjection {
  /** The service name as it is registered in Cordis. */
  readonly service: string
  /**
   * True when the plugin only acquires this service at runtime, so its absence
   * leaves that one contribution unloaded rather than failing the plugin.
   */
  readonly optional: boolean
}

/** One plugin's row in the graph. */
export interface GraphNode {
  /** The Loader entry's stable id. */
  readonly id: string
  /** The package or module name the entry loaded. */
  readonly name: string
  /** Lifecycle state as a label; `unloaded` when the entry has no fiber at all. */
  readonly state: string
  /** Services this plugin provides. */
  readonly provides: readonly string[]
  /**
   * Every service this plugin injects, by either declaration style — the union
   * across the entry's own fiber and every fiber it started at runtime.
   */
  readonly injects: readonly GraphInjection[]
}

/** One dependency edge: the consumer injecting `service`, and the provider. */
export interface GraphEdge {
  /** Consumer entry id. */
  readonly from: string
  /** Provider entry id. */
  readonly to: string
  /** The service that makes the edge. */
  readonly service: string
  /** Mirrors {@link GraphInjection.optional} for the service that makes this edge. */
  readonly optional: boolean
}

/**
 * One REQUIRED injected service with no provider anywhere in this composition.
 *
 * Only required injections are listed: an optional one with no provider has
 * simply not been offered yet, and the plugin is working as designed.
 */
export interface UnresolvedDependency {
  /** The consumer that asked for it. */
  readonly from: string
  /** The service name nothing provides. */
  readonly service: string
}

/** One service with more than one live implementation, i.e. an isolated one. */
export interface IsolatedService {
  /** The service name shared by the implementations. */
  readonly service: string
  /** Entry ids providing it, one per isolation label. */
  readonly providers: readonly string[]
}

/** The whole graph, as the browser half reads it. */
export interface PluginGraph {
  /** Every Loader entry, in load order. */
  readonly nodes: readonly GraphNode[]
  /** Every resolved dependency. */
  readonly edges: readonly GraphEdge[]
  /** Injections no provider answers. */
  readonly unresolved: readonly UnresolvedDependency[]
  /** Services provided under more than one isolation label. */
  readonly isolated: readonly IsolatedService[]
}
