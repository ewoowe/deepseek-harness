/**
 * The in-session message-history overlay.
 *
 * Lists every user message of the CURRENT session and jumps the transcript to
 * the chosen one. Registered into the `shell.overlay` slot, so it stays mounted
 * for the whole session and renders null while closed — the same shape the
 * slash menu uses to keep its keyboard state alive.
 *
 * The list is read from the rendered transcript rather than from the session
 * model. That is deliberate: a third-party plugin cannot reach `ui-chat`'s
 * node store, but ChatView itself resolves its scroll anchors through these two
 * attributes, so they are contracts rather than internals:
 *
 * - `[data-conversation-scroll]` — the scrollport (ChatView's own `scrollerOf`).
 * - `[data-chat-flow-kind="user"|"steering"]` — one human message row.
 *
 * Only the loaded window is listed. "Load earlier" pages history in through the
 * session face and rebuilds.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { CONFIG_GLOBAL, resolveConfig, type HistoryConfig } from '../shared.ts'
import type { HistoryKey } from './locales.ts'

/** One listed message. */
export interface MessageEntry {
  /** Stable-ish identity for React keys; the DOM node key. */
  readonly id: string
  /** Preview text shown in the row. */
  readonly label: string
}

/** Props the slot hands the component: standard shares plus the inject face. */
export interface HistoryOverlaySlotProps {
  /** Injected: page one earlier history window in, if any remains. */
  loadOlder: () => Promise<void>
  /** Locale-bound translate function. */
  t: (key: HistoryKey) => string
}

interface OverlayProps {
  /** Resolved configuration. */
  readonly config: HistoryConfig
  /** Injected: page one earlier history window in. */
  readonly loadOlder: () => Promise<void>
  /** Locale-bound translate function. */
  readonly t: (key: HistoryKey) => string
}

/** Vertical breathing room above a landed row, matching ChatView's own jump. */
const LAND_OFFSET_PX = 24

/** DOM id of one row, the aria-activedescendant target. */
function rowId(index: number): string {
  return `dsh-history-row-${String(index)}`
}

/** Capture-phase document listener helper returning its disposer. */
function onDocumentKeyDown(handler: (event: KeyboardEvent) => void): () => void {
  document.addEventListener('keydown', handler, true)
  return () => { document.removeEventListener('keydown', handler, true) }
}

/** Whether a keydown matches the configured chord exactly. */
function matchesChord(event: KeyboardEvent, config: HistoryConfig): boolean {
  return event.key.toLowerCase() === config.key.toLowerCase()
    && event.ctrlKey === config.ctrl
    && event.altKey === config.alt
    && event.shiftKey === config.shift
    && event.metaKey === config.meta
}

/** The transcript's scrollport, or null when no conversation is mounted. */
function scrollport(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-conversation-scroll]')
}

/**
 * Collect the current session's human messages in transcript order.
 * @returns one entry per rendered user message row.
 */
function collectMessages(): MessageEntry[] {
  const scroller = scrollport()
  if (scroller === null) return []
  const rows = scroller.querySelectorAll<HTMLElement>(
    '[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]',
  )
  const entries: MessageEntry[] = []
  for (const row of rows) {
    if (row.hidden) continue
    const key = row.dataset.chatAnchorKey ?? row.dataset.chatFlowKey
    if (key === undefined) continue
    const label = (row.textContent ?? '').replace(/\s+/gu, ' ').trim()
    entries.push({ id: key, label: label === '' ? '(no text)' : label })
  }
  return entries
}

/** Resolve one listed message back to its rendered row. */
function rowOf(id: string): HTMLElement | null {
  const scroller = scrollport()
  if (scroller === null) return null
  return scroller.querySelector<HTMLElement>(`[data-chat-anchor-key="${CSS.escape(id)}"]`)
}

/**
 * Land a row at the top of the scrollport — ChatView's own jump arithmetic.
 * @param row - target row inside the scrollport.
 */
function landOnRow(row: HTMLElement): void {
  const scroller = scrollport()
  if (scroller === null) return
  const delta = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  scroller.scrollTop += delta - LAND_OFFSET_PX
}

/**
 * Slot entry: owns the row list and renders the overlay.
 * @param props - the inject face and copy.
 * @returns the overlay tree.
 */
export function HistoryOverlaySlot({ loadOlder, t }: HistoryOverlaySlotProps): ReactNode {
  // Read once at mount: the Node half writes the global before any plugin
  // bundle runs, and a runtime change would mean a page reload anyway.
  const config = useMemo(
    () => resolveConfig((globalThis as Record<string, unknown>)[CONFIG_GLOBAL]),
    [],
  )
  return <HistoryOverlay config={config} loadOlder={loadOlder} t={t} />
}

/**
 * Render the overlay: closed state returns null but keeps the listeners mounted.
 * @param props - configuration, the paging action, and copy.
 * @returns the overlay tree.
 */
export function HistoryOverlay({ config, loadOlder, t }: OverlayProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [entries, setEntries] = useState<readonly MessageEntry[]>([])
  const [loading, setLoading] = useState(false)

  const close = useCallback(() => { setOpen(false) }, [])

  // The list is a snapshot of the rendered window: rebuild on every open so a
  // session that grew (or paged in) while closed is reflected.
  const refresh = useCallback(() => {
    setEntries(collectMessages())
    setActive(0)
  }, [])

  // The chord: always armed, toggles the overlay, and suppresses the browser's
  // own binding (Ctrl+S is "save page" in every major browser).
  useEffect(() => onDocumentKeyDown((event) => {
    if (!matchesChord(event, config)) return
    event.preventDefault()
    event.stopPropagation()
    setOpen((current) => {
      if (!current) refresh()
      return !current
    })
  }), [config, refresh])

  // Navigation: armed only while open.
  useEffect(() => {
    if (!open) return undefined
    return onDocumentKeyDown((event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive(index => Math.min(index + 1, entries.length - 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive(index => Math.max(index - 1, 0))
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const entry = entries[active]
        if (entry === undefined) return
        const row = rowOf(entry.id)
        if (row !== null) landOnRow(row)
        setOpen(false)
      }
    })
  }, [open, entries, active])

  // A shrinking list must never leave the highlight past its end.
  useEffect(() => {
    setActive(index => Math.min(index, Math.max(0, entries.length - 1)))
  }, [entries.length])

  const jumpTo = (id: string): void => {
    const row = rowOf(id)
    if (row !== null) landOnRow(row)
    setOpen(false)
  }

  const pageOlder = async (): Promise<void> => {
    setLoading(true)
    try {
      await loadOlder()
      refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={close} headless title={t('title')}>
      <div style={{
        width: 'min(640px, 80vw)',
        padding: '12px 0 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
      >
        <div style={{ padding: '0 16px 8px', fontSize: 13, opacity: 0.7 }}>{t('title')}</div>
        {entries.length === 0
          ? <div style={{ padding: '8px 16px', fontSize: 13, opacity: 0.6 }}>{t('empty')}</div>
          : (
            <div
              role="listbox"
              aria-label={t('title')}
              aria-activedescendant={rowId(active)}
              style={{ maxHeight: 340, overflowY: 'auto' }}
            >
              {entries.slice(0, config.maxRows).map((entry, index) => (
                <button
                  key={entry.id}
                  id={rowId(index)}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  onMouseMove={() => { setActive(index) }}
                  onClick={() => { jumpTo(entry.id) }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 16px',
                    border: 'none',
                    textAlign: 'start',
                    background: index === active ? 'rgba(127,127,127,0.16)' : 'transparent',
                    color: 'inherit',
                    font: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 11, opacity: 0.5, marginRight: 8 }}>{index + 1}</span>
                  <span style={{
                    display: 'inline-block',
                    maxWidth: 'calc(100% - 32px)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    verticalAlign: 'bottom',
                  }}
                  >
                    {entry.label.slice(0, 120)}
                  </span>
                </button>
              ))}
            </div>
          )}
        <button
          type="button"
          onClick={() => { void pageOlder() }}
          disabled={loading}
          style={{
            margin: '4px 16px 0',
            padding: '6px 12px',
            alignSelf: 'flex-start',
            border: '1px solid rgba(127,127,127,0.4)',
            borderRadius: 6,
            background: 'transparent',
            color: 'inherit',
            font: 'inherit',
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? t('loading') : t('loadOlder')}
        </button>
        <div style={{ padding: '8px 16px 0', fontSize: 11, opacity: 0.5 }}>{t('jumpHint')}</div>
      </div>
    </Modal>
  )
}
