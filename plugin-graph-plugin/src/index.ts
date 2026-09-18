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
import { CLIENT_GRAPH_PATH, GRAPH_PATH, THEME_CSS_PATH, VIEWER_PATH, VIEWER_SCRIPT_PATH } from './graph-types.ts'
// Only the report itself: `PluginGraph` is re-exported below, and importing the
// name here as well is a duplicate identifier.
import type { ClientGraphReport } from './graph-types.ts'
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
/** The design tokens copied at build time, served beside the viewer. */
const THEME_CSS = fileURLToPath(new URL('./theme.css', import.meta.url))


/**
 * Serve the graph, its standalone viewer page, and the viewer's script.
 *
 * Three routes rather than one with a switch: they are three different content
 * types with three different lifetimes — the graph is computed per request, the
 * page is a constant, and the script is read per request so that rebuilding the
 * viewer takes effect on a reload instead of requiring the host to restart.
 * @param ctx - host context.
 */
/**
 * The browser half's last report, or null before any app has sent one.
 *
 * Held in memory rather than written down: it describes a runtime that only
 * exists while a page is open, so a report surviving a host restart would be
 * describing something that is not there.
 */
let clientReport: ClientGraphReport | null = null

/**
 * Accept a report only if it has the shape the viewer will render.
 *
 * This arrives over HTTP from a same-origin page rather than from our own code,
 * so it is input: a malformed one would not fail here, it would fail in the
 * viewer's canvas with a stack the reader cannot act on. Checking the top-level
 * arrays is enough to keep that from happening, and cheap enough to do on every
 * request.
 * @param value - the parsed request body.
 * @returns the report, or null when it is not one.
 */
function asReport(value: unknown): ClientGraphReport | null {
  if (typeof value !== 'object' || value === null) return null
  const { graph, at } = value as { graph?: unknown; at?: unknown }
  if (typeof at !== 'number' || !Number.isFinite(at)) return null
  if (typeof graph !== 'object' || graph === null) return null
  const candidate = graph as Partial<Record<'nodes' | 'edges' | 'unresolved' | 'isolated', unknown>>
  for (const field of ['nodes', 'edges', 'unresolved', 'isolated'] as const) {
    if (!Array.isArray(candidate[field])) return null
  }
  // Named through the report's own field rather than by importing the graph type,
  // which this module re-exports under the same name.
  return { graph: graph as ClientGraphReport['graph'], at }
}

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
      handler: (req, res) => {
        res.setHeader('content-type', 'text/html; charset=utf-8')
        // The app puts its locale in this URL — the page has no locale service of
        // its own — and `viewerPage` validates it against the dictionaries before
        // it reaches the document. The base is a placeholder: only the query is
        // read, because a request target from the wire may be a path alone.
        const query = new URL(req.url ?? '/', 'http://localhost').searchParams
        res.end(viewerPage(query.get('lang')))
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

    // The design tokens the panel styles itself with — light and dark, both
    // from the theme package. Read per request like the viewer script, so a
    // rebuild takes effect on reload without a host restart.
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: THEME_CSS_PATH,
      handler: (_req, res) => {
        res.setHeader('content-type', 'text/css; charset=utf-8')
        res.end(readFileSync(THEME_CSS, 'utf8'))
      },
    }), 'plugin-graph: design tokens')

    // The browser half's tree, one way: the app POSTs what it collected, the
    // viewer GETs it. This exists because the standalone viewer is a document
    // this half serves and has no client Cordis of its own — the app is the only
    // half that can see that runtime, so it is the only half that can describe
    // it. A GET before any report is a 404 rather than an empty graph: "nobody
    // has looked yet" and "there is nothing there" are different answers.
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: CLIENT_GRAPH_PATH,
      handler: (req, res) => {
        if (req.method === 'GET') {
          if (clientReport === null) {
            res.statusCode = 404
            res.setHeader('content-type', 'text/plain; charset=utf-8')
            res.end('plugin-graph: no browser graph has been reported yet\n')
            return
          }
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(clientReport))
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.setEncoding('utf8')
        req.on('data', (chunk: string) => { body += chunk })
        req.on('end', () => {
          let report: ClientGraphReport | null = null
          try {
            report = asReport(JSON.parse(body) as unknown)
          } catch {
            report = null
          }
          if (report === null) {
            res.statusCode = 400
            res.end()
            return
          }
          clientReport = report
          res.statusCode = 204
          res.end()
        })
      },
    }), 'plugin-graph: client graph route')
  })
}
