/** Overlay and settings card copy. English is the source of truth; Chinese mirrors it section for section. */

/** One dictionary key of the message-history plugin (overlay + settings card). */
export type HistoryKey =
  | 'title'
  | 'empty'
  | 'closeLabel'
  | 'loadOlder'
  | 'loading'
  | 'count'
  | 'hintPick'
  | 'hintPage'
  | 'hintJump'
  | 'hintClose'
  | 'settingsTitle'
  | 'settingsDescription'
  | 'fieldKey'
  | 'fieldKeyHint'
  | 'fieldCtrl'
  | 'fieldAlt'
  | 'fieldShift'
  | 'fieldMeta'
  | 'fieldMaxRows'
  | 'fieldMaxRowsHint'
  | 'overridden'
  | 'reset'
  | 'invalidKey'
  | 'invalidMaxRows'
  | 'save'
  | 'discard'
  | 'saving'
  | 'saveFailed'
  | 'unavailable'

const en: Record<HistoryKey, string> = {
  title: 'Messages in this session',
  empty: 'No messages yet.',
  closeLabel: 'Close',
  loadOlder: 'Load earlier',
  loading: 'Loading…',
  count: '{count} loaded',
  hintPick: 'select',
  hintPage: 'page',
  hintJump: 'jump',
  hintClose: 'close',
  settingsTitle: 'Session history',
  settingsDescription: 'Keyboard shortcut and list size for the in-session message jump overlay.',
  fieldKey: 'Chord key',
  fieldKeyHint: 'The single KeyboardEvent.key character that opens the overlay. Case-insensitive.',
  fieldCtrl: 'Require Control',
  fieldAlt: 'Require Option / Alt',
  fieldShift: 'Require Shift',
  fieldMeta: 'Require Command / Meta',
  fieldMaxRows: 'Maximum rows',
  fieldMaxRowsHint: 'Cap on the number of messages listed in the overlay.',
  overridden: 'Overridden',
  reset: 'Reset',
  invalidKey: 'The chord key must be a single character.',
  invalidMaxRows: 'Max rows must be a positive integer.',
  save: 'Save',
  discard: 'Discard',
  saving: 'Saving…',
  saveFailed: 'Save was rejected. Fix the highlighted field and try again.',
  unavailable: 'The session-history configuration is not available to this page.',
}

const zh: Record<HistoryKey, string> = {
  title: '本会话的消息',
  empty: '还没有消息',
  closeLabel: '关闭',
  loadOlder: '加载更早',
  loading: '加载中…',
  count: '已加载 {count} 条',
  hintPick: '选择',
  hintPage: '翻页',
  hintJump: '跳转',
  hintClose: '关闭',
  settingsTitle: '会话历史',
  settingsDescription: '弹窗式消息跳转的快捷键和列表大小。',
  fieldKey: '唤出键',
  fieldKeyHint: '打开弹窗的 KeyboardEvent.key 单字符；大小写不敏感。',
  fieldCtrl: '需要 Ctrl',
  fieldAlt: '需要 Option / Alt',
  fieldShift: '需要 Shift',
  fieldMeta: '需要 Command / Meta',
  fieldMaxRows: '最大行数',
  fieldMaxRowsHint: '弹窗列表能展示多少条消息的上限。',
  overridden: '已覆盖',
  reset: '重置',
  invalidKey: '唤出键必须是单个字符。',
  invalidMaxRows: '最大行数必须是正整数。',
  save: '保存',
  discard: '放弃',
  saving: '保存中…',
  saveFailed: '保存被拒。修正高亮字段后重试。',
  unavailable: '本页面无法访问会话历史的配置。',
}

export { en, zh }
