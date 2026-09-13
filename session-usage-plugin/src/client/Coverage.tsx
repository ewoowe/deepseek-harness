/**
 * The coverage line both usage views share.
 *
 * Every table here can only fold the session's LOADED event window, so a partial
 * table has to say so. It is one component rather than two because the two views
 * would otherwise drift in exactly the way this project keeps rediscovering: two
 * implementations of one rule, disagreeing in the case nobody tested.
 *
 * The gap is also split by CAUSE, because the causes call for different actions —
 * events that are simply not loaded can be fetched, while a turn whose lifecycle
 * is incomplete has nothing to fetch.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { MessagesKey } from './locales.ts'

/** Everything the line reports, computed by the view that owns the table. */
export interface CoverageProps {
  /** Turns the table actually folded. */
  readonly covered: number
  /** Turns the host counted for the session. */
  readonly total: number
  /** Of the gap, turns whose events are not loaded. */
  readonly outside: number
  /** Of the gap, turns whose usage the host's fold refuses to compute. */
  readonly withoutUsage: number
  /** Whether "load the full history" can make a difference right now. */
  readonly canLoad: boolean
  readonly loading: boolean
  readonly onLoad: () => void
  readonly t: Translate<MessagesKey>
}

export function Coverage({
  covered, total, outside, withoutUsage, canLoad, loading, onLoad, t,
}: CoverageProps): ReactNode {
  if (total <= covered) return null
  return (
    <div style={COVERAGE_STYLE}>
      <span>{t('coverage', { covered: String(covered), total: String(total) })}</span>
      {outside > 0 && <span>{t('outsideWindow', { count: String(outside) })}</span>}
      {withoutUsage > 0 && <span>{t('noUsage', { count: String(withoutUsage) })}</span>}
      {canLoad && (
        <>
          <button
            type="button"
            disabled={loading}
            title={t('loadAllHint')}
            onClick={onLoad}
            style={BUTTON_STYLE}
          >
            {t('loadAll')}
          </button>
          {/* The one consequence a reader would not predict from the label: the
              load is shared with the transcript, so its messages arrive too. */}
          <span style={NOTE_STYLE}>{t('loadAllAlso')}</span>
        </>
      )}
    </div>
  )
}

const COVERAGE_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
  fontSize: 11,
  color: 'var(--dsw-alias-label-tertiary)',
}

const BUTTON_STYLE: CSSProperties = {
  padding: '2px 8px',
  border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary)',
  font: 'inherit',
  fontSize: 11,
  cursor: 'pointer',
}

const NOTE_STYLE: CSSProperties = {
  fontSize: 11,
  color: 'var(--dsw-alias-label-dimmed)',
}
