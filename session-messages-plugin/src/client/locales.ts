/** Overlay and settings card copy. English is the source of truth; Chinese mirrors it section for section. */

/** One dictionary key of the session-messages plugin (overlay + settings card). */
export type MessagesKey =
  | 'title'
  | 'empty'
  | 'closeLabel'
  | 'count'
  | 'sessionTime'
  | 'sessionUsage'
  | 'sessionCacheHit'
  | 'numberThousand'
  | 'numberMillion'
  | 'durationSeconds'
  | 'durationMinutes'
  | 'hintPick'
  | 'hintWheelUp'
  | 'hintWheelDown'
  | 'hintPage'
  | 'hintJump'
  | 'hintClose'
  | 'settingsTitle'
  | 'settingsDescription'
  | 'expand'
  | 'collapse'
  | 'unsaved'
  | 'readOnly'
  | 'fieldKey'
  | 'fieldKeyHint'
  | 'fieldCtrl'
  | 'fieldAlt'
  | 'fieldShift'
  | 'fieldMeta'
  | 'fieldWheelUp'
  | 'fieldWheelDown'
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

const en: Record<MessagesKey, string> = {
  title: 'Messages in this session',
  empty: 'No messages yet.',
  closeLabel: 'Close',
  count: '{count} loaded',
  sessionTime: 'Time {duration}',
  sessionUsage: 'Usage {total}',
  sessionCacheHit: 'Cache hit {percent}%',
  numberThousand: '{value}K',
  numberMillion: '{value}M',
  durationSeconds: '{seconds}s',
  durationMinutes: '{minutes}m{seconds}s',
  hintPick: 'select',
  hintWheelUp: 'up: previous · down: next',
  hintWheelDown: 'up: next · down: previous',
  hintPage: 'page',
  hintJump: 'jump',
  hintClose: 'close',
  settingsTitle: 'Session messages',
  settingsDescription: 'Keyboard shortcut and list size for the in-session message jump overlay.',
  expand: 'Expand',
  collapse: 'Collapse',
  unsaved: 'Unsaved',
  readOnly: 'The settings document of this deployment is read-only.',
  fieldKey: 'Chord key',
  fieldKeyHint: 'The single KeyboardEvent.key character that opens the overlay. Case-insensitive.',
  fieldCtrl: 'Require Control',
  fieldAlt: 'Require Option / Alt',
  fieldShift: 'Require Shift',
  fieldMeta: 'Require Command / Meta',
  fieldWheelUp: 'Scroll up selects the previous row',
  fieldWheelDown: 'Scroll up selects the next row',
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
  unavailable: 'The session-messages configuration is not available to this page.',
}

const zh: Record<MessagesKey, string> = {
  title: '本会话的消息',
  empty: '还没有消息',
  closeLabel: '关闭',
  count: '已加载 {count} 条',
  sessionTime: '用时 {duration}',
  sessionUsage: '用量 {total}',
  sessionCacheHit: '缓存命中 {percent}%',
  numberThousand: '{value}K',
  numberMillion: '{value}M',
  durationSeconds: '{seconds}秒',
  durationMinutes: '{minutes}分{seconds}秒',
  hintPick: '选择',
  hintWheelUp: '向上：上一条 · 向下：下一条',
  hintWheelDown: '向上：下一条 · 向下：上一条',
  hintPage: '翻页',
  hintJump: '跳转',
  hintClose: '关闭',
  settingsTitle: '会话消息',
  settingsDescription: '弹窗式消息跳转的快捷键和列表大小。',
  expand: '展开',
  collapse: '收起',
  unsaved: '未保存',
  readOnly: '本部署的设置文档是只读的。',
  fieldKey: '唤出键',
  fieldKeyHint: '打开弹窗的 KeyboardEvent.key 单字符；大小写不敏感。',
  fieldCtrl: '需要 Ctrl',
  fieldAlt: '需要 Option / Alt',
  fieldShift: '需要 Shift',
  fieldMeta: '需要 Command / Meta',
  fieldWheelUp: '向上滚动选择上一条',
  fieldWheelDown: '向上滚动选择下一条',
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
  unavailable: '本页面无法访问会话消息的配置。',
}

export { en, zh }
