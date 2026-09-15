/** Live-view copy. English is the source of truth; Chinese mirrors it key for key. */

/** Locale namespace owned by this plugin. */
export const NS = 'sessionLive'

/** The keys this plugin's two dictionaries carry. */
export type MessagesKey =
  | 'title'
  | 'empty'
  | 'composerBlocked'
  | 'numberThousand'
  | 'numberMillion'
  | 'durationSeconds'
  | 'durationMinutes'
  | 'contextTitle'
  | 'contextOfWindow'
  | 'contextProjected'
  | 'contextNoWindow'
  | 'llmLabel'
  | 'toolLabel'
  | 'turnsLabel'
  | 'tokensLabel'
  | 'stepsTitle'
  | 'stepRunning'
  | 'toolRunning'
  | 'toolFailed'
  | 'noTools'
  | 'streamTitle'
  | 'streamEmpty'
  | 'loadAll'
  | 'loading'

const en: Record<MessagesKey, string> = {
  title: 'Live',
  empty: 'Nothing has run in this session yet.',
  composerBlocked: 'This view reports on the running turn and cannot take a message.',
  numberThousand: '{value}K',
  numberMillion: '{value}M',
  durationSeconds: '{seconds}s',
  durationMinutes: '{minutes}m{seconds}s',
  contextTitle: 'Context',
  contextOfWindow: '{used} / {total}',
  contextProjected: 'next request ≈ {value}',
  contextNoWindow: 'window size unknown',
  llmLabel: 'model {value}',
  toolLabel: 'tools {value}',
  turnsLabel: '{value} turns',
  tokensLabel: '{value} tokens',
  stepsTitle: 'Steps',
  stepRunning: 'running',
  toolRunning: 'running…',
  toolFailed: 'failed',
  noTools: 'no tool calls',
  streamTitle: 'Event stream',
  streamEmpty: 'No events in the loaded window.',
  loadAll: 'Load the rest of the session',
  loading: 'Loading…',
}

const zh: Record<MessagesKey, string> = {
  title: '实时',
  empty: '本次会话还没有执行任何内容。',
  composerBlocked: '本视图报告正在进行的轮次，无法接收消息。',
  numberThousand: '{value}K',
  numberMillion: '{value}M',
  durationSeconds: '{seconds}s',
  durationMinutes: '{minutes}m{seconds}s',
  contextTitle: '上下文',
  contextOfWindow: '{used} / {total}',
  contextProjected: '下次请求 ≈ {value}',
  contextNoWindow: '窗口大小未知',
  llmLabel: '模型 {value}',
  toolLabel: '工具 {value}',
  turnsLabel: '{value} 轮',
  tokensLabel: '{value} tokens',
  stepsTitle: '步骤',
  stepRunning: '运行中',
  toolRunning: '运行中…',
  toolFailed: '失败',
  noTools: '无工具调用',
  streamTitle: '事件流',
  streamEmpty: '已加载窗口内没有事件。',
  loadAll: '加载会话的其余部分',
  loading: '加载中…',
}

export { en, zh }

/**
 * Register the namespace with the slot renderer.
 *
 * This merge is what puts the typed `t` seat on the view's props and what lets
 * the registration name `sessionLive` as its locale: without it, cordis refuses
 * the registration outright rather than handing the view an unbound translate.
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    sessionLive: MessagesKey
  }
}
