/**
 * The standalone viewer's document, as a string.
 *
 * A string rather than a `.html` file beside the bundle: it is a dozen lines and
 * one stylesheet, and a file would have to be listed in `files` for the published
 * package and resolved relative to the built module — more moving parts than the
 * thing it holds.
 *
 * The stylesheet's real job is the design tokens. The panel styles itself with
 * the app's `--dsw-*` custom properties, which the app's theme defines; this page
 * has no theme, so it stands in as one. The list below is exactly the set the
 * panel references, which is why it is short — a token added to a component but
 * not here shows up as an unstyled property, not as a build error.
 */
import { VIEWER_SCRIPT_PATH } from './graph-types.ts'

/**
 * Build the document.
 * @returns a complete HTML page that mounts the viewer.
 */
export function viewerPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dsh plugin graph</title>
<style>
:root {
  color-scheme: dark;
  --dsw-alias-bg-layer-1: #1b1b1d;
  --dsw-alias-bg-layer-2: #26262a;
  --dsw-alias-border-l2: #3a3a40;
  --dsw-alias-label-primary: #ececef;
  --dsw-alias-label-secondary: #a8a8b0;
  --dsw-alias-label-tertiary: #74747e;
  --dsw-alias-state-success-primary: #4cc38a;
  --dsw-alias-state-error-primary: #e5534b;
}
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
}
#root { padding: 16px; }
</style>
</head>
<body>
<div id="root"></div>
<script src="${VIEWER_SCRIPT_PATH}" defer></script>
</body>
</html>
`
}
