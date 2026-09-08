/** Overlay copy. English is the source of truth; Chinese mirrors it section for section. */

/** One dictionary key of the message-history overlay. */
export type HistoryKey =
  | 'title'
  | 'empty'
  | 'loadOlder'
  | 'loading'
  | 'jumpHint'

const en: Record<HistoryKey, string> = {
  title: 'Messages in this session',
  empty: 'No messages yet.',
  loadOlder: 'Load earlier messages',
  loading: 'Loading…',
  jumpHint: '↑↓ to choose · Enter to jump · Esc to close',
}

const zh: Record<HistoryKey, string> = {
  title: '本会话的消息',
  empty: '还没有消息。',
  loadOlder: '加载更早的消息',
  loading: '加载中…',
  jumpHint: '↑↓ 选择 · Enter 跳转 · Esc 关闭',
}

export { en, zh }
