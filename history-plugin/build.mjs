/**
 * Build both halves of the plugin.
 *
 * A plain script rather than a `tsdown.config.*` file: this checkout's tsdown
 * loads a config file through `unrun`, which is not in its dependency set, so
 * the CLI path cannot start. The programmatic `build()` API takes the same
 * options inline and never touches the config loader.
 *
 * `config: false` is required — without it every call still probes for a
 * config file and re-enters the failing import.
 */
import { build } from 'tsdown'

/** Plugin id stamped into the module-loader handoff. */
const ID = 'dsh-session-history'

/** Keep every bare specifier external: the module table answers them at runtime. */
const externals = {
  name: 'dsh-standalone-externals',
  resolveId: {
    order: 'pre',
    handler(source, importer) {
      // An entry has no importer and must stay internal.
      if (importer === undefined) return null
      const bare = !source.startsWith('.') && !source.startsWith('\0') && !source.startsWith('/')
      return bare ? { id: source, external: true } : null
    },
  },
}

/** Shared options for both halves. */
const common = {
  config: false,
  format: ['esm'],
  target: 'es2024',
  dts: false,
  clean: false,
  outDir: 'lib',
  plugins: [externals],
}

// Node half: the Loader imports this by `main` for name, Config, and apply.
await build({
  ...common,
  entry: { index: 'src/index.ts' },
  platform: 'node',
  // Rolldown defaults the ESM output to .mjs; both halves are named from the
  // package.json exports map, so pin the extension instead of restating it.
  outputOptions: { entryFileNames: 'index.js' },
})

// Browser half: a closure factory registered with the client module loader.
// `cjs`, not `esm`: the factory receives `require` and runs as a function
// body, so ESM `import` statements would be illegal there. The repository's
// own client preset makes the same choice (packages/client/tsdown.client.ts).
await build({
  ...common,
  format: ['cjs'],
  entry: { client: 'src/client/index.ts' },
  platform: 'browser',
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})

console.log('history-plugin: built lib/index.js and lib/client.js')
