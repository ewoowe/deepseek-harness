/**
 * Host half of the plugin-graph plugin.
 *
 * It answers one question about the running composition: which plugin provides
 * the services every other plugin injects. The answer is assembled from three
 * places, each supplying one piece:
 *
 * - the Loader's own entry list — which carries the plugin NAME, and therefore
 *   the node labels a reader recognises;
 * - Cordis's reflection layer — `reflect.store` names the fiber that provides
 *   each service, which is one end of every dependency;
 * - Cordis's plugin registry — `runtime.fibers` enumerates every live fiber,
 *   which is what makes the other end complete: a plugin's dependencies are the
 *   union over every fiber it started, not just the one its module began.
 *
 * No one of them is enough alone. `reflect.store` has no plugin names (only
 * fibers); the entry list has no edges (only declarations); and `entry.fiber`
 * alone hides every service a plugin acquires at runtime through
 * `ctx.inject(deps, callback)`, because that helper starts a fiber of its own.
 *
 * The graph is served over HTTP rather than injected into the index page, because
 * it is not static: `dsh-tool-cordis` can mount and unmount dynamic packages, so a
 * snapshot taken at boot would go stale while the page is open.
 *
 * Scope: the HOST runtime only. The browser half is a different Cordis tree with
 * its own `reflect` and its own service names; merging the two would not be a
 * bigger graph, it would be a wrong one.
 * @module dsh-plugin-graph
 */
import type { Context, Fiber } from '@deepseek-ai/cordis'
// Type-only merges: these pull in ctx.loader and ctx.webServer.
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-host-webserver'

export const name = 'plugin-graph'



import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { GRAPH_PATH, VIEWER_PATH, VIEWER_SCRIPT_PATH } from './graph-types.ts'
import type {
  GraphEdge, GraphInjection, GraphNode, IsolatedService, PluginGraph, UnresolvedDependency,
} from './graph-types.ts'
import { viewerPage } from './viewer-page.ts'

export { GRAPH_PATH, VIEWER_PATH }
export type {
  GraphEdge, GraphInjection, GraphNode, IsolatedService, PluginGraph, UnresolvedDependency,
}

/**
 * Absolute path of the built viewer script.
 *
 * Resolved against this MODULE rather than the process's working directory: the
 * Node half runs as `lib/index.js` from whatever directory the profile happened
 * to be started in, and `viewer.js` is its sibling in that same `lib/`.
 */
const VIEWER_SCRIPT = fileURLToPath(new URL('./viewer.js', import.meta.url))

/**
 * Value mirror of Cordis's `FiberState` const enum.
 *
 * A const enum has no runtime object to import, so the numbers are restated here
 * rather than read from the module — the same reason `dsh-tool-cordis` carries a
 * mirror of its own.
 */
const STATE_LABELS: Record<number, string> = {
  0: 'pending',
  1: 'loading',
  2: 'active',
  3: 'failed',
  4: 'disposed',
  5: 'unloading',
}

/**
 * Synthetic node id standing for the root fiber.
 *
 * The root fiber provides the harness's own services (`loader`, `jobs`, `sandbox`,
 * the environment rows) and has no Loader entry to name it, so the graph gives it
 * a node of its own rather than dropping every edge that lands on it.
 */
const ROOT_NODE_ID = '(harness)'

/**
 * The id of the Loader entry that owns a fiber, in the spelling nodes use.
 *
 * The same walk as `loader.locate()` — and deliberately not a call to it, for
 * one reason: `locate()` returns `entry.id`, the qualified tree path, while a
 * node is keyed by `entry.options.id`. Those are different strings (`locate()`
 * answers `include:plugin-graph` for an entry whose `options.id` is
 * `plugin-graph`), so the two cannot be compared directly — doing so silently
 * drops every nested fiber into a bucket no node ever reads.
 *
 * The Loader stamps `fiber.entry` on a child fiber from its parent context, so
 * a nested fiber belongs to the same entry as the plugin that spawned it,
 * however deep the nesting goes. Parent-walking covers the rest.
 * @param fiber - any fiber in the composition.
 * @returns the owning entry's node id, or undefined when no entry owns it.
 */
function ownerNodeId(fiber: Fiber): string | undefined {
  let current: Fiber | undefined = fiber
  while (current !== undefined) {
    if (current.entry !== undefined) return current.entry.options.id
    const next: Fiber | undefined = current.parent?.fiber
    // The root fiber is its own parent; reaching it means the walk left the tree.
    if (next === undefined || next === current) return undefined
    current = next
  }
  return undefined
}

/**
 * Every live fiber in the composition, grouped by the id of the Loader entry
 * that owns it.
 *
 * `entry.fiber` is only the fiber the entry's own module started. A plugin can
 * start more at runtime — `ctx.plugin(...)`, and every `ctx.inject(deps, cb)`
 * call, which is that same call — and each of those children carries an `inject`
 * map of its own. Reading `entry.fiber` alone therefore reports a plugin's
 * declared requirements and silently drops everything it acquires at runtime,
 * which is how every optional contribution in this composition is written.
 *
 * The entry's own fiber is inserted first for every entry, so `[0]` is the
 * declaration that gates activation and the rest are runtime acquisitions.
 * @param ctx - host context with `loader` and `registry` in scope.
 * @returns node id → its fibers, the entry's own fiber first.
 */
function fibersByEntry(ctx: Context): Map<string, Fiber[]> {
  const byEntry = new Map<string, Fiber[]>()
  // UID, not object identity: `ctx` is a Proxy and `entry.fiber` is the
  // `Object.create` wrapper `registry.plugin()` returns, so one logical fiber is
  // reachable as two distinct objects. Same reason `ownerOfUid` below is keyed
  // by UID.
  const seen = new Set<number>()
  const add = (id: string | undefined, fiber: Fiber): void => {
    if (id === undefined) return
    if (typeof fiber.uid === 'number') {
      if (seen.has(fiber.uid)) return
      seen.add(fiber.uid)
    }
    const fibers = byEntry.get(id) ?? []
    fibers.push(fiber)
    byEntry.set(id, fibers)
  }
  for (const entry of ctx.loader.entries()) {
    if (entry.fiber !== undefined) add(entry.options.id, entry.fiber)
  }
  // Every live fiber, not just the entries' own: `registry.forEach` is the only
  // place that sees the fibers a plugin started after it was loaded.
  ctx.registry.forEach((runtime) => {
    for (const fiber of runtime.fibers) add(ownerNodeId(fiber), fiber)
  })
  return byEntry
}

/**
 * Collect the host's plugin dependency graph.
 * @param ctx - host context with `loader` and `reflect` in scope.
 * @returns the graph the browser half renders.
 */
export function collectGraph(ctx: Context): PluginGraph {
  const entries = [...ctx.loader.entries()]

  // fiber uid → entry id. Matched by UID rather than by object identity: `ctx` is
  // a Proxy, so the fiber reachable from an entry and the fiber recorded on an
  // implementation are the same logical fiber without being the same object.
  const ownerOfUid = new Map<number, string>()
  for (const entry of entries) {
    const uid = entry.fiber?.uid
    if (typeof uid === 'number') ownerOfUid.set(uid, entry.options.id)
  }

  // Services by owner, and owners by service, filled from the authoritative list.
  //
  // `reflect.store` is that list. It is keyed by isolation SYMBOL — which is what
  // resolving one name to its realm needs — so the service name comes from the
  // record rather than from the key. `fiber.store` is the wrong source here: it
  // also holds the implementations a fiber merely DEPENDS on, which would report
  // every consumer of `fs` as a provider of it.
  const providersByName = new Map<string, string[]>()
  const servicesOfOwner = new Map<string, string[]>()
  const record = (service: string, owner: string): void => {
    const owners = providersByName.get(service) ?? []
    if (!owners.includes(owner)) owners.push(owner)
    providersByName.set(service, owners)
    const provided = servicesOfOwner.get(owner) ?? []
    if (!provided.includes(service)) provided.push(service)
    servicesOfOwner.set(owner, provided)
  }

  const store = ctx.reflect.store as Record<symbol, { name: string; fiber: Fiber } | undefined>
  for (const symbol of Object.getOwnPropertySymbols(store)) {
    const impl = store[symbol]
    if (impl === undefined) continue
    const uid = impl.fiber.uid
    // A provider with no entry is the harness itself: the root fiber, and the
    // Loader's own fiber. They get the synthetic node rather than being dropped,
    // which is what keeps `loader` and the environment rows from reading as
    // unresolved dependencies of everything that injects them.
    const owner = typeof uid === 'number' ? ownerOfUid.get(uid) : undefined
    record(impl.name, owner ?? ROOT_NODE_ID)
  }

  // What each entry injects, split by what the declaration gates. Both halves
  // are real dependencies and both get edges; the split decides only whether a
  // missing provider is reported as a fault.
  const fibersOf = fibersByEntry(ctx)
  const injectionsOf = (id: string): GraphInjection[] => {
    const [own, ...nested] = fibersOf.get(id) ?? []
    const injections: GraphInjection[] = Object.keys(own?.inject ?? {})
      .map(service => ({ service, optional: false }))
    for (const fiber of nested) {
      for (const service of Object.keys(fiber.inject)) {
        // Required wins when both declarations name the same service: the
        // stricter one is the one that decides whether the plugin loads.
        if (injections.some(injection => injection.service === service)) continue
        injections.push({ service, optional: true })
      }
    }
    return injections
  }
  // An entry that never loaded has no fibers, and therefore no injections —
  // which replaces the old `entry.fiber === undefined` guard on the edge loop.
  const injectionsById = new Map<string, GraphInjection[]>(
    entries.map(entry => [entry.options.id, injectionsOf(entry.options.id)]),
  )

  const nodes: GraphNode[] = entries.map(entry => ({
    id: entry.options.id,
    name: entry.options.name,
    state: entry.fiber === undefined
      ? 'unloaded'
      : (STATE_LABELS[entry.fiber.state as number] ?? String(entry.fiber.state)),
    provides: servicesOfOwner.get(entry.options.id) ?? [],
    injects: injectionsById.get(entry.options.id) ?? [],
  }))

  const harnessServices = servicesOfOwner.get(ROOT_NODE_ID) ?? []
  if (harnessServices.length > 0) {
    nodes.push({
      id: ROOT_NODE_ID,
      name: ROOT_NODE_ID,
      state: 'active',
      provides: harnessServices,
      injects: Object.keys(ctx.root.fiber.inject ?? {})
        .map(service => ({ service, optional: false })),
    })
  }

  const edges: GraphEdge[] = []
  const unresolved: UnresolvedDependency[] = []
  for (const entry of entries) {
    const id = entry.options.id
    for (const { service, optional } of injectionsById.get(id) ?? []) {
      const providers = providersByName.get(service)
      if (providers === undefined || providers.length === 0) {
        // Only a required service with no provider is a fault. An optional one
        // that nothing provides is the ordinary resting state of the callback
        // form: that contribution stays unloaded and the plugin is fine.
        if (!optional) unresolved.push({ from: id, service })
        continue
      }
      // One edge per provider: an isolated service legitimately has several, and
      // keeping only the first would hide exactly what `isolate` was for.
      for (const providerId of providers) {
        edges.push({ from: id, to: providerId, service, optional })
      }
    }
  }

  const isolated: IsolatedService[] = [...providersByName.entries()]
    .filter(([, providers]) => providers.length > 1)
    .map(([service, providers]) => ({ service, providers }))

  return { nodes, edges, unresolved, isolated }
}

/**
 * Serve the graph, its standalone viewer page, and the viewer's script.
 *
 * Three routes rather than one with a switch: they are three different content
 * types with three different lifetimes — the graph is computed per request, the
 * page is a constant, and the script is read per request so that rebuilding the
 * viewer takes effect on a reload instead of requiring the host to restart.
 * @param ctx - host context.
 */
export function apply(ctx: Context): void {
  ctx.inject(['loader', 'webServer'], (scope: Context) => {
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: GRAPH_PATH,
      handler: (_req, res) => {
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(collectGraph(scope)))
      },
    }), 'plugin-graph: graph route')

    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: VIEWER_PATH,
      handler: (_req, res) => {
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.end(viewerPage())
      },
    }), 'plugin-graph: viewer page')

    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: VIEWER_SCRIPT_PATH,
      handler: (_req, res) => {
        let script: string
        try {
          script = readFileSync(VIEWER_SCRIPT, 'utf8')
        } catch (error) {
          // A missing `viewer.js` means the plugin was installed without its
          // build output. Say so rather than serving an empty page that fails
          // with nothing in the console but a syntax error.
          res.statusCode = 500
          res.setHeader('content-type', 'text/plain; charset=utf-8')
          res.end(`plugin-graph: viewer script is not built at ${VIEWER_SCRIPT}\n${String(error)}`)
          return
        }
        res.setHeader('content-type', 'text/javascript; charset=utf-8')
        res.end(script)
      },
    }), 'plugin-graph: viewer script')
  })
}
