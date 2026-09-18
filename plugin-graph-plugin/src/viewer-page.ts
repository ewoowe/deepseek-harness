/**
 * The standalone viewer's document, as a string.
 *
 * A string rather than a `.html` file beside the bundle: it is a dozen lines and
 * one stylesheet, and a file would have to be listed in `files` for the published
 * package and resolved relative to the built module — more moving parts than the
 * thing it holds.
 *
 * The tokens themselves come from the theme package, served at THEME_CSS_PATH by
 * the Node half — light and dark, switched by `body[data-ds-dark-theme]`, the
 * same attribute the app's own boot script toggles. What remains in this page's
 * stylesheet is the shell: the initial color scheme for the moment before the
 * script applies the app's own, and the padding.
 */
import { THEME_CSS_PATH, VIEWER_SCRIPT_PATH } from './graph-types.ts'

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
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
}
#root { padding: 16px; }
</style>
<!-- AFTER the shell style, so the theme's tokens win wherever they overlap it. -->
<link rel="stylesheet" href="${THEME_CSS_PATH}">
</head>
<body>
<div id="root"></div>
<script src="${VIEWER_SCRIPT_PATH}" defer></script>
</body>
</html>
`
}
