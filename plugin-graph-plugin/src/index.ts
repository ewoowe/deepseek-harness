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
import type { Context } from '@deepseek-ai/cordis'
// Type-only merges: these pull in ctx.loader and ctx.webServer.
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-host-webserver'

export const name = 'plugin-graph'



import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { collectGraph } from './collect.ts'
import { GRAPH_PATH, VIEWER_PATH, VIEWER_SCRIPT_PATH } from './graph-types.ts'
import type {
  GraphEdge, GraphInjection, GraphNode, IsolatedService, PluginGraph, UnresolvedDependency,
} from './graph-types.ts'
import { viewerPage } from './viewer-page.ts'

// Re-exported so the module's public face is unchanged by the extraction: the
// collector moved to its own file, but `import { collectGraph } from 'dsh-plugin-graph'`
// still answers here.
export { collectGraph }
export { GRAPH_PATH, VIEWER_PATH }
export type {
  GraphEdge, GraphInjection, GraphNode, IsolatedService, PluginGraph, UnresolvedDependency,
} from './graph-types.ts'

/**
 * Absolute path of the built viewer script.
 *
 * Resolved against this MODULE rather than the process's working directory: the
 * Node half runs as `lib/index.js` from whatever directory the profile happened
 * to be started in, and `viewer.js` is its sibling in that same `lib/`.
 */
const VIEWER_SCRIPT = fileURLToPath(new URL('./viewer.js', import.meta.url))


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
