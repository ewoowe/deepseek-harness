/**
 * The session-history settings card.
 *
 * Stages edits over the `session-history` settings namespace and writes them
 * on save. Lives in this package rather than the monorepo's
 * `dsh-client-ui-settings-plugins` because that package's shared
 * `CardForm`/`PluginCard` pair has no boolean field type — and chord
 * modifiers are the only field-shape difference this card needs, so a few
 * hand-rolled inputs and the primitives' `Switch` are simpler than borrowing
 * the shared form machinery.
 */
import {
  useCallback, useEffect, useRef, useState, useSyncExternalStore,
  type CSSProperties, type ReactNode,
} from 'react'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { IconChevronDownOutline14, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { DEFAULT_CONFIG, type HistoryConfig } from '../shared.ts'
import type { HistoryKey } from './locales.ts'

/** SettingsScope is the typed window onto the Host document. */
export type HistorySettingsScope = SettingsScope<HistoryConfig>

/** One draft value pending a save. Undefined means the field is unchanged. */
type Draft = {
  key?: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  meta?: boolean
  maxRows?: number
}

/** Field ids the card edits; iterated in render order. */
const FIELDS = ['key', 'ctrl', 'alt', 'shift', 'meta', 'maxRows'] as const
type Field = typeof FIELDS[number]

interface SettingsCardProps {
  /** Bound settings scope for the `session-history` namespace. Absent renders the unavailable state. */
  scope: HistorySettingsScope | undefined
  /** Locale translate. */
  t: (key: HistoryKey, params?: Record<string, unknown>) => string
}

/**
 * Read the current scope snapshot through `useSyncExternalStore` so the card
 * re-renders whenever the Host document changes (including a peer write from
 * elsewhere in the same surface, in case a future change ever touches this
 * namespace).
 */
/**
 * Snapshot reported when no scope is bound. The card already renders its
 * `unavailable` state for a snapshot with no value, so a missing scope degrades
 * to that message instead of throwing inside the slot's error boundary and
 * taking the whole card list down with it.
 */
const NO_SCOPE_SNAPSHOT = {
  status: 'unavailable',
  value: undefined,
  revision: undefined,
  writable: false,
  mode: 'memory',
} as unknown as SettingsScopeSnapshot<HistoryConfig>

function useScope(scope: HistorySettingsScope | undefined): SettingsScopeSnapshot<HistoryConfig> {
  return useSyncExternalStore(
    (listener) => (scope === undefined ? () => {} : scope.subscribe(listener)),
    () => (scope === undefined ? NO_SCOPE_SNAPSHOT : scope.getSnapshot()),
    () => (scope === undefined ? NO_SCOPE_SNAPSHOT : scope.getSnapshot()),
  )
}

/** Local validation that mirrors the Host-side `assertServiceable` in src/index.ts. */
function isFieldInvalid(
  field: Field,
  value: unknown,
  invalidLabel: string,
  invalidMaxRowsLabel: string,
): string | null {
  if (field === 'key') {
    return typeof value === 'string' && value.length === 1 ? null : invalidLabel
  }
  if (field === 'maxRows') {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? null : invalidMaxRowsLabel
  }
  return null
}

/** True when the field's stored value differs from the schema default. */
function isFieldOverridden(snapshot: SettingsScopeSnapshot<HistoryConfig>, field: Field): boolean {
  const user = snapshot.user as Record<string, unknown> | undefined
  return user !== undefined && Object.hasOwn(user, field)
}

export function HistorySettingsCard(props: SettingsCardProps): ReactNode {
  // A missing `t` would throw on the very first label and take the whole card
  // down inside the slot's error boundary. Falling back to key-named labels
  // keeps the hooks below unconditional — an early return here would render
  // zero hooks on the first pass and one on the next.
  const { scope } = props
  const t: (key: HistoryKey, params?: Record<string, unknown>) => string =
    typeof props.t === 'function' ? props.t : (key) => String(key)
  const snapshot = useScope(scope)
  const [draft, setDraft] = useState<Draft>({})
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  /**
   * Collapsed by default, matching the other cards in this section: the list is
   * a scan of several plugins, so an always-open card pushes the rest off
   * screen. Disclosure is card-local reading state — the Host has no stake in
   * which one is open.
   */
  const [open, setOpen] = useState(false)
  /** Whether a save is in flight, so it can collapse only after it settles. */
  const saveStarted = useRef(false)

  // An external write (or the first mount, once status flips from loading to
  // ready) drops a held draft that already matches the canonical value so the
  // save button does not stay armed against stale text.
  useEffect(() => {
    if (snapshot.value === undefined) return
    setDraft((previous) => {
      let changed = false
      const next: Draft = { ...previous }
      for (const field of FIELDS) {
        const staged = previous[field]
        if (staged === undefined) continue
        const current = (snapshot.value as Record<string, unknown>)[field]
        if (staged === current) {
          delete next[field]
          changed = true
        }
      }
      return changed ? next : previous
    })
  }, [snapshot])

  const current = snapshot.value
  if (current === undefined) {
    return (
      <div style={CARD_STYLE}>
        <h3 style={TITLE_STYLE}>{t('settingsTitle')}</h3>
        <p style={DESC_STYLE}>{t('unavailable')}</p>
      </div>
    )
  }

  // What each field would become on save: a staged edit takes priority, then
  // the stored value, then the schema default.
  const effective = (field: Field): unknown => {
    const staged = draft[field]
    if (staged !== undefined) return staged
    return (current as Record<string, unknown>)[field]
      ?? (DEFAULT_CONFIG as Record<string, unknown>)[field]
  }

  const stage = (field: Field, value: unknown): void => {
    setFailed(false)
    setDraft((previous) => {
      const live = (current as Record<string, unknown>)[field]
        ?? (DEFAULT_CONFIG as Record<string, unknown>)[field]
      if (value === live) {
        const next = { ...previous }
        delete next[field]
        return next
      }
      return { ...previous, [field]: value as never }
    })
  }

  const resetField = useCallback(async (field: Field): Promise<void> => {
    setFailed(false)
    setDraft((previous) => {
      const next = { ...previous }
      delete next[field]
      return next
    })
    if (isFieldOverridden(snapshot, field)) {
      try { await scope.unset(field) } catch { /* the next snapshot reports the rejection */ }
    }
  }, [scope, snapshot])

  const dirty = FIELDS.some((field) => draft[field] !== undefined)
  const invalid = FIELDS.some((field) => {
    const staged = draft[field]
    if (staged === undefined) return false
    return isFieldInvalid(field, staged, t('invalidKey'), t('invalidMaxRows')) !== null
  })
  const writable = snapshot.writable && !saving

  const save = async (): Promise<void> => {
    if (!dirty || invalid || !writable) return
    setSaving(true)
    setFailed(false)
    let landed = true
    try {
      for (const field of FIELDS) {
        const staged = draft[field]
        if (staged === undefined) continue
        try {
          await scope.set(field, staged as never)
        } catch {
          landed = false
        }
      }
      if (landed) setDraft({})
      setFailed(!landed)
    } finally {
      setSaving(false)
    }
  }

  const discard = (): void => {
    setDraft({})
    setFailed(false)
  }

  // Collapse only after the write settles: a rejected save keeps its error and
  // the staged values on screen for correction. Matches PluginCard's behavior.
  useEffect(() => {
    if (saving) {
      saveStarted.current = true
      return
    }
    if (!saveStarted.current) return
    saveStarted.current = false
    if (!dirty && !failed) setOpen(false)
  }, [dirty, failed, saving])

  return (
    <div style={CARD_STYLE}>
      <button
        type="button"
        style={HEADER_BUTTON_STYLE}
        aria-expanded={open}
        aria-label={`${t(open ? 'collapse' : 'expand')}: ${t('settingsTitle')}`}
        onClick={() => { setOpen(!open) }}
      >
        <span style={HEAD_TEXT_STYLE}>
          <span style={TITLE_STYLE}>{t('settingsTitle')}</span>
          <span style={DESC_STYLE}>{t('settingsDescription')}</span>
        </span>
        {dirty && <span style={PENDING_STYLE}>{t('unsaved')}</span>}
        <span style={CHEVRON_STYLE(open)} aria-hidden="true">
          <IconChevronDownOutline14 />
        </span>
      </button>

      {open ? (
        <>
          {!writable && <p style={STATUS_STYLE} role="status">{t('readOnly')}</p>}

      <KeyField
        field="key"
        label={t('fieldKey')}
        hint={t('fieldKeyHint')}
        invalidLabel={t('invalidKey')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        value={String(effective('key') ?? '')}
        staged={draft.key}
        onChange={(text) => { stage('key', text) }}
        onReset={() => { void resetField('key') }}
        overridden={isFieldOverridden(snapshot, 'key') && draft.key === undefined}
        disabled={!writable}
      />

      <SwitchRow
        label={t('fieldCtrl')}
        value={Boolean(effective('ctrl'))}
        staged={draft.ctrl}
        onChange={(next) => { stage('ctrl', next) }}
        onReset={() => { void resetField('ctrl') }}
        overridden={isFieldOverridden(snapshot, 'ctrl') && draft.ctrl === undefined}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        disabled={!writable}
      />
      <SwitchRow
        label={t('fieldAlt')}
        value={Boolean(effective('alt'))}
        staged={draft.alt}
        onChange={(next) => { stage('alt', next) }}
        onReset={() => { void resetField('alt') }}
        overridden={isFieldOverridden(snapshot, 'alt') && draft.alt === undefined}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        disabled={!writable}
      />
      <SwitchRow
        label={t('fieldShift')}
        value={Boolean(effective('shift'))}
        staged={draft.shift}
        onChange={(next) => { stage('shift', next) }}
        onReset={() => { void resetField('shift') }}
        overridden={isFieldOverridden(snapshot, 'shift') && draft.shift === undefined}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        disabled={!writable}
      />
      <SwitchRow
        label={t('fieldMeta')}
        value={Boolean(effective('meta'))}
        staged={draft.meta}
        onChange={(next) => { stage('meta', next) }}
        onReset={() => { void resetField('meta') }}
        overridden={isFieldOverridden(snapshot, 'meta') && draft.meta === undefined}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        disabled={!writable}
      />

      <KeyField
        field="maxRows"
        numeric
        label={t('fieldMaxRows')}
        hint={t('fieldMaxRowsHint')}
        invalidLabel={t('invalidMaxRows')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        value={effective('maxRows') !== undefined ? String(effective('maxRows')) : ''}
        staged={draft.maxRows}
        onChange={(text) => {
          const trimmed = text.trim()
          if (trimmed === '') { stage('maxRows', DEFAULT_CONFIG.maxRows); return }
          const parsed = Number(trimmed)
          stage('maxRows', Number.isFinite(parsed) ? parsed : Number.NaN)
        }}
        onReset={() => { void resetField('maxRows') }}
        overridden={isFieldOverridden(snapshot, 'maxRows') && draft.maxRows === undefined}
        disabled={!writable}
      />

      {failed && <p style={ERROR_STYLE}>{t('saveFailed')}</p>}

      <div style={FOOTER_STYLE}>
        <button
          type="button"
          onClick={discard}
          disabled={!dirty || saving}
          style={BUTTON_STYLE(!dirty || saving, false)}
        >
          {t('discard')}
        </button>
        <button
          type="button"
          onClick={() => { void save() }}
          disabled={!dirty || invalid || !writable}
          style={BUTTON_STYLE(!dirty || invalid || !writable, true)}
        >
          {saving ? t('saving') : t('save')}
        </button>
      </div>
        </>
      ) : null}
    </div>
  )
}

// --- Field controls -------------------------------------------------------

interface KeyFieldProps {
  field: Field
  label: string
  hint: string
  invalidLabel: string
  overriddenLabel: string
  resetLabel: string
  value: string
  staged: unknown
  onChange: (text: string) => void
  onReset: () => void
  overridden: boolean
  numeric?: boolean
  disabled: boolean
}

function KeyField(props: KeyFieldProps): ReactNode {
  const stagedString = props.staged !== undefined ? String(props.staged) : null
  const invalid = stagedString !== null
    && isFieldInvalid(props.field, props.staged, props.invalidLabel, props.invalidLabel) !== null
    && !(props.field === 'maxRows' && props.staged === DEFAULT_CONFIG.maxRows)
  const dirty = stagedString !== null && stagedString !== props.value
  const showOverridden = props.overridden && !dirty
  return (
    <div style={FIELD_STYLE}>
      <div style={FIELD_HEAD_STYLE}>
        <label htmlFor={`history-settings-${props.field}`} style={LABEL_STYLE}>{props.label}</label>
        {(showOverridden || dirty) && (
          <span style={BADGES_STYLE}>
            {showOverridden && <span style={BADGE_STYLE}>{props.overriddenLabel}</span>}
            <button type="button" onClick={props.onReset} disabled={props.disabled} style={RESET_BTN_STYLE}>
              {props.resetLabel}
            </button>
          </span>
        )}
      </div>
      <input
        id={`history-settings-${props.field}`}
        type="text"
        {...props.numeric === true ? { inputMode: 'numeric' as const } : {}}
        value={stagedString ?? props.value}
        onChange={(event) => { props.onChange(event.target.value) }}
        disabled={props.disabled}
        aria-invalid={invalid}
        style={INPUT_STYLE(invalid)}
      />
      <p style={invalid ? INVALID_HINT_STYLE : HINT_STYLE}>
        {invalid ? props.invalidLabel : props.hint}
      </p>
    </div>
  )
}

interface SwitchRowProps {
  label: string
  value: boolean
  staged: unknown
  onChange: (next: boolean) => void
  onReset: () => void
  overridden: boolean
  overriddenLabel: string
  resetLabel: string
  disabled: boolean
}

function SwitchRow(props: SwitchRowProps): ReactNode {
  const dirty = props.staged !== undefined && Boolean(props.staged) !== props.value
  const showOverridden = props.overridden && !dirty
  return (
    <div style={FIELD_STYLE}>
      <div style={FIELD_HEAD_STYLE}>
        <label style={LABEL_STYLE}>{props.label}</label>
        <span style={BADGES_STYLE}>
          {showOverridden && <span style={BADGE_STYLE}>{props.overriddenLabel}</span>}
          <button type="button" onClick={props.onReset} disabled={props.disabled} style={RESET_BTN_STYLE}>
            {props.resetLabel}
          </button>
        </span>
      </div>
      <div style={SWITCH_ROW_BODY_STYLE}>
        <Switch
          checked={props.staged !== undefined ? Boolean(props.staged) : props.value}
          onChange={props.onChange}
          label={props.label}
          disabled={props.disabled}
        />
      </div>
    </div>
  )
}

// --- Styles (inline; reuse the design tokens the rest of the plugin does) ---

const CARD_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: 20,
  borderRadius: 16,
  background: 'var(--dsw-alias-bg-layer-2)',
  color: 'var(--dsw-alias-label-primary)',
  fontFamily: 'var(--dsw-specific-font, -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif)',
  fontSize: 14,
  lineHeight: '20px',
  boxShadow: 'var(--dsw-elevation-prominent)',
}

/** The whole header is one button: title stacked over description, chevron at the end. */
const HEADER_BUTTON_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  margin: 0,
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'start',
  cursor: 'pointer',
}

const HEAD_TEXT_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const CHEVRON_STYLE = (open: boolean): CSSProperties => ({
  flex: 'none',
  display: 'inline-flex',
  color: 'var(--dsw-alias-label-secondary)',
  transition: 'transform 120ms ease',
  transform: open ? 'rotate(180deg)' : 'none',
})

const PENDING_STYLE: CSSProperties = {
  flex: 'none',
  padding: '1px 8px',
  borderRadius: 999,
  background: 'var(--dsw-alias-bg-fill-1)',
  fontSize: 11,
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-secondary)',
}

const TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 500,
  lineHeight: '24px',
  color: 'var(--dsw-alias-label-primary)',
}

const DESC_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: 'var(--dsw-alias-label-secondary)',
}

const STATUS_STYLE: CSSProperties = {
  fontSize: 12,
  color: 'var(--dsw-alias-label-tertiary)',
}

const ERROR_STYLE: CSSProperties = {
  margin: 0,
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--dsw-alias-state-error-primary)',
  background: 'rgba(255, 0, 0, 0.06)',
}

const FIELD_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const FIELD_HEAD_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}

const LABEL_STYLE: CSSProperties = {
  fontSize: 13,
  color: 'var(--dsw-alias-label-primary)',
}

const BADGES_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const BADGE_STYLE: CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 999,
  fontSize: 11,
  lineHeight: '16px',
  color: 'var(--dsw-alias-label-secondary)',
  background: 'var(--dsw-alias-bg-fill-1)',
}

const RESET_BTN_STYLE: CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  border: 'none',
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary)',
  font: 'inherit',
  fontSize: 11,
  lineHeight: '16px',
  cursor: 'pointer',
}

const INPUT_STYLE = (invalid: boolean): CSSProperties => ({
  height: 32,
  padding: '0 10px',
  border: '0.5px solid ' + (invalid ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-border-l2)'),
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-layer-1)',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  fontSize: 14,
  outline: 'none',
})

const HINT_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: 'var(--dsw-alias-label-tertiary)',
}

const INVALID_HINT_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: 'var(--dsw-alias-state-error-primary)',
}

const SWITCH_ROW_BODY_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '4px 0',
}

const FOOTER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 8,
  paddingTop: 8,
  borderTop: '0.5px solid var(--dsw-alias-border-l2)',
}

const BUTTON_STYLE = (disabled: boolean, primary: boolean): CSSProperties => ({
  height: 32,
  padding: '0 14px',
  border: 'none',
  borderRadius: 8,
  background: primary ? 'var(--dsw-alias-button-primary-fill)' : 'var(--dsw-alias-bg-fill-1)',
  color: primary ? 'var(--dsw-alias-label-primary-foreground)' : 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  fontSize: 13,
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.55 : 1,
  transition: 'background 80ms ease',
})
