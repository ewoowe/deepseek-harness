/**
 * The usage view: what this session has spent, read two ways.
 *
 * One tab, two leaves — per model and per message — because they answer the same
 * question at two resolutions, and a reader comparing them should not have to
 * remember which of two sibling tabs they were just in. The container owns the
 * fold, the coverage, the polling and the shared totals; the tables are
 * presentational, so nothing here can drift from nothing there.
 *
 * Two sources, and the split is the point. The totals come from the client
 * session's projections — Host-computed over the WHOLE log, so paging the window
 * in or compacting it cannot move them. The per-turn detail cannot come from
 * there, because no projection carries a model or turn dimension; it is folded
 * from the session's own event window, with the usage counting left to the host's
 * own fold so these figures cannot drift from a tail clock or a turn dialog.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { Coverage } from './Coverage.tsx'
import { formatCompactDuration, formatCompactTokens, type SessionTotals } from './format.ts'
import { NS, type MessagesKey } from './locales.ts'
import { MessageUsageTable } from './MessageUsageTable.tsx'
import { ModelUsageTable } from './ModelUsageTable.tsx'
import { useModelNameLookup } from './model-names.ts'
import { useLeaf, useScrollMemory, writeLeaf } from './preferences.ts'
import { EMPTY_STYLE, ROOT_STYLE } from './table-styles.ts'
import type { TurnFacts } from './turn-facts.ts'
import { foldUsageByModel } from './usage-by-model.ts'

/** The face this plugin injects into its own view registration. */
export interface UsageViewInjected {
  /** Every turn's facts for the viewing session, or null when no binding exists. */
  readonly turnFacts: () => ReadonlyMap<number, TurnFacts> | null
  /** The session's own totals, or null while the projections are absent. */
  readonly sessionTotals: () => SessionTotals | null
  /**
   * Whether the session holds older events this window has not materialised.
   *
   * The per-turn detail can only fold what the window carries, so this is what
   * separates "this session used one model" from "one page of it did".
   */
  readonly hasOlder: () => boolean
  /** Page the rest of the session in, so the tables can cover all of it. */
  readonly loadOlder: () => Promise<void>
  /**
   * Make the composer inert with a reason, or clear it.
   *
   * The composer belongs to the shell, not to this view — a view cannot hide it,
   * and this is the only lever the contract offers. It is a SINGLE slot that other
   * plugins raise reasons in too (model selection blocks it when no route is
   * available), so this view raises its reason on the way in and clears it on the
   * way out, the same contract those plugins follow.
   */
  readonly blockComposer: (reason: string | null) => void
}

/** Full view props, as the registration supplies them. */
export type UsageViewProps =
  PropsRuntime<'conversation.view'> & PropsLocale<typeof NS> & UsageViewInjected

/**
 * How often the tables are re-read.
 *
 * A poll, because the fold behind these figures is memoised on the event window's
 * own revision: over an idle session one tick costs a single integer comparison,
 * and a dashboard has no interaction that a live push would improve.
 */
const REFRESH_MS = 2_000

export function UsageView({
  turnFacts, sessionTotals, hasOlder, loadOlder, blockComposer, t,
}: UsageViewProps): ReactNode {
  const [, setTick] = useState(0)
  const [loading, setLoading] = useState(false)
  // Remembered, not merely held: both leaves are conditionally rendered, so a
  // reader coming back to the per-message table would otherwise have to find the
  // leaf again on every visit.
  const leaf = useLeaf()
  // Same reason as the leaf above, one dimension further: the shell parks a
  // conversation area at the bottom, so a reader returning to a long table was
  // shown a different part of it every time.
  const root = useRef<HTMLDivElement>(null)
  useScrollMemory(root)
  useEffect(() => {
    const timer = window.setInterval(() => { setTick(value => value + 1) }, REFRESH_MS)
    return () => { window.clearInterval(timer) }
  }, [])
  // There is nothing to type here, so the composer is made inert rather than left
  // inviting input that this view cannot show. It is not hidden — that is the
  // shell's chrome, and no view option reaches it — but a reader who lands here
  // and starts typing gets the reason instead of a silently ignored draft.
  useEffect(() => {
    blockComposer(t('composerBlocked'))
    return () => { blockComposer(null) }
  }, [blockComposer, t])

  const nameOf = useModelNameLookup()
  const totals = sessionTotals()
  const facts = turnFacts()
  const turns = facts === null ? [] : [...facts.values()]
  const models = facts === null || leaf !== 'models' ? [] : foldUsageByModel(facts)
  // Coverage is the same question for both leaves — one window, one answer — so it
  // is computed once here rather than inside each table.
  const covered = turns.filter(turn => turn.usage !== null).length
  const total = totals?.turns ?? 0
  const outside = Math.max(0, total - turns.length)
  const withoutUsage = Math.max(0, turns.length - covered)
  const canLoad = outside > 0 && hasOlder()

  return (
    // `data-conversation-composer-overlay` is the shell's own switch for "this
    // view is a full-bleed surface that scrolls itself": it hides the transcript
    // width handles (whose 40px strips were landing on this table's right-hand
    // figures and offering a drag nobody aimed at), lifts the composer into a
    // floating overlay, and hands the scrolling to this element — which is what
    // `ROOT_STYLE` is shaped for. Declared here rather than patched onto the
    // frame's DOM: the shell renders the whole mode off this one attribute, and
    // it goes away by itself when this view does.
    <div ref={root} style={ROOT_STYLE} data-conversation-composer-overlay="">
      {totals !== null && (
        <div style={CHIPS_STYLE}>
          <span style={CHIP_STYLE}>{t('tokensLabel', { value: formatCompactTokens(totals.totalTokens, t) })}</span>
          <span style={CHIP_STYLE}>{t('busyLabel', { value: formatCompactDuration(totals.busyMs, t) })}</span>
          {totals.cacheHitPercent !== null && (
            <span style={CHIP_STYLE}>{t('cacheLabel', { percent: totals.cacheHitPercent })}</span>
          )}
        </div>
      )}
      <div style={LEAVES_STYLE}>
        <LeafButton active={leaf === 'models'} label={t('modelTitle')} onSelect={() => { writeLeaf('models') }} />
        <LeafButton active={leaf === 'messages'} label={t('messageTitle')} onSelect={() => { writeLeaf('messages') }} />
      </div>
      {leaf === 'models'
        ? (models.length === 0
            ? <div style={EMPTY_STYLE}>{t('empty')}</div>
            : <ModelUsageTable models={models} nameOf={nameOf} t={t} />)
        : (turns.length === 0
            ? <div style={EMPTY_STYLE}>{t('empty')}</div>
            : <MessageUsageTable turns={turns} nameOf={nameOf} t={t} />)}
      <Coverage
        covered={covered}
        total={total}
        outside={outside}
        withoutUsage={withoutUsage}
        canLoad={canLoad}
        loading={loading}
        onLoad={() => {
          setLoading(true)
          void loadOlder()
            .then(() => { setTick(value => value + 1) })
            .catch(() => undefined)
            .finally(() => { setLoading(false) })
        }}
        t={t}
      />
    </div>
  )
}

/** One of the two leaves. */
function LeafButton({ active, label, onSelect }: {
  readonly active: boolean
  readonly label: string
  readonly onSelect: () => void
}): ReactNode {
  return (
    <button type="button" aria-pressed={active} onClick={onSelect} style={LEAF_STYLE(active)}>
      {label}
    </button>
  )
}

const CHIPS_STYLE: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6 }

const CHIP_STYLE: CSSProperties = {
  padding: '2px 8px',
  borderRadius: 999,
  background: 'var(--dsw-alias-bg-layer-2)',
  fontSize: 12,
  color: 'var(--dsw-alias-label-secondary)',
}

const LEAVES_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: 2,
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-layer-2)',
  alignSelf: 'flex-start',
}

/**
 * The active leaf inverts, the way this plugin's primary buttons do everywhere
 * else; the inactive one keeps the strip's own background so the pair reads as one
 * control rather than as two buttons.
 */
function LEAF_STYLE(active: boolean): CSSProperties {
  return {
    padding: '3px 10px',
    border: 'none',
    borderRadius: 6,
    background: active ? 'var(--dsw-alias-label-primary)' : 'transparent',
    color: active ? 'var(--dsw-alias-bg-layer-2)' : 'var(--dsw-alias-label-secondary)',
    font: 'inherit',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
  }
}
