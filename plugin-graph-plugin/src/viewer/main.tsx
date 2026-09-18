/**
 * The standalone viewer: the dependency graph as a whole page.
 *
 * It renders the SAME panel as the settings section (../client/GraphPanel.tsx),
 * not a copy of it. The two hosts differ only in what they can supply:
 *
 * - the locale: the app binds `t` through `ctx.locale`, which does not exist on a
 *   page with no cordis runtime, so this one is built from the same dictionaries
 *   in ../client/locales.ts;
 * - the theme: the panel styles itself with the app's `--dsw-*` design tokens,
 *   which here come from the shim in the served document (../viewer-page.ts)
 *   instead of from the app's theme;
 * - the height: a whole page uses the window rather than a fixed 520px panel.
 *
 * React is BUNDLED into this script by build.mjs rather than left external: there
 * is no module table on this page to answer a bare `react` import.
 */
import {
  createElement, useCallback, useEffect, useState, type ReactNode,
} from 'react'
import { createRoot } from 'react-dom/client'
import { GraphPanel } from '../client/GraphPanel.tsx'
import { en, type Translate, zh } from '../client/locales.ts'

/** The dictionaries this page chooses between, by browser language. */
const DICTIONARIES = { en, zh } as const

/** A locale this page can render in. */
type ViewerLocale = keyof typeof DICTIONARIES

/**
 * Height kept for the panel's own chrome above and around the drawing — the
 * heading, the stats row, the problems block, the page padding. Approximate on
 * purpose: a window that still overflows simply scrolls.
 */
const CHROME_HEIGHT = 220

/**
 * Substitute `{name}` placeholders.
 *
 * The app's `t` comes from the locale service, which does this itself; a page
 * with no locale service has to repeat it. All placeholders in the dictionaries
 * are the same `{name}` form, which is what keeps this from needing to be a
 * template engine.
 * @param template - a dictionary entry, possibly containing `{name}`.
 * @param params - values by name.
 * @returns the entry with every known placeholder replaced.
 */
function interpolate(template: string, params?: Record<string, unknown>): string {
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/gu, (match, name: string) =>
    (Object.hasOwn(params, name) ? String(params[name]) : match))
}

/**
 * The browser's preferred language, restricted to the ones this page carries.
 * @returns 'zh' or 'en'.
 */
function pickLocale(): ViewerLocale {
  for (const tag of navigator.languages ?? [navigator.language]) {
    const lower = tag.toLowerCase()
    if (lower.startsWith('zh')) return 'zh'
    if (lower.startsWith('en')) return 'en'
  }
  return 'en'
}

/**
 * The page body.
 * @returns the panel, translated, sized to the window.
 */
function Viewer(): ReactNode {
  const [locale] = useState<ViewerLocale>(pickLocale)
  const [height, setHeight] = useState(520)

  useEffect(() => {
    const measure = (): void => {
      // Floored so a short window still gets a usable drawing and scrolls the
      // rest, rather than collapsing to a strip.
      setHeight(Math.max(320, window.innerHeight - CHROME_HEIGHT))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => { window.removeEventListener('resize', measure) }
  }, [])

  const t = useCallback<Translate>(
    (key, params) => interpolate(DICTIONARIES[locale][key], params),
    [locale],
  )

  // Set from the dictionary rather than hardcoded in the document, so the tab
  // title and the on-page heading agree.
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    document.title = DICTIONARIES[locale].title
  }, [locale])

  return createElement(GraphPanel, { t, viewerPath: null, canvasHeight: height })
}

const host = document.getElementById('root')
if (host !== null) createRoot(host).render(createElement(Viewer))
