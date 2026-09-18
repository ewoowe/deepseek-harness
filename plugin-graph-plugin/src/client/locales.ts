/** Plugin-graph copy. English is the source of truth; Chinese mirrors it key for key. */

/** Locale namespace owned by this plugin. */
export const NS = 'pluginGraph'

/** The keys this plugin's two dictionaries carry. */
export type MessagesKey =
  | 'title'
  | 'intro'
  | 'introClient'
  | 'clientCollectedAt'
  | 'scopeHost'
  | 'scopeClient'
  | 'refresh'
  | 'loading'
  | 'failed'
  | 'statPlugins'
  | 'statEdges'
  | 'statUnresolved'
  | 'sectionGraph'
  | 'sectionDetail'
  | 'selectHint'
  | 'graphHint'
  | 'zoomIn'
  | 'zoomOut'
  | 'fitView'
  | 'openInTab'
  | 'searchPlaceholder'
  | 'searchMatches'
  | 'searchNone'
  | 'provides'
  | 'injects'
  | 'injectsOptional'
  | 'nothingProvides'
  | 'nothingInjects'
  | 'nothingInjectsOptional'
  | 'optionalMark'
  | 'usedBy'
  | 'dependsOn'
  | 'noUsedBy'
  | 'noDependsOn'
  | 'unresolvedTitle'
  | 'isolatedTitle'
  | 'unresolvedNone'
  | 'isolatedNone'
  | 'stateActive'
  | 'stateFailed'
  | 'stateOther'

const en: Record<MessagesKey, string> = {
  title: 'Plugin graph',
  intro: 'Which plugin provides the services every other plugin injects, read from the live Cordis runtime.',
  introClient: 'The browser half is a separate Cordis runtime with its own plugins and its own service names. The two graphs are not comparable and are never merged — a merged one would be a wrong one, not a bigger one.',
  clientCollectedAt: 'Browser tree collected {when}.',
  scopeHost: 'Host',
  scopeClient: 'Browser',
  refresh: 'Refresh',
  loading: 'Reading the runtime…',
  failed: 'Could not read the graph.',
  statPlugins: '{value} plugins',
  statEdges: '{value} dependencies',
  statUnresolved: '{value} unresolved',
  sectionGraph: 'Dependency graph',
  sectionDetail: 'Detail',
  selectHint: 'Pick a node to see what it provides and what it depends on.',
  graphHint: 'Scroll to zoom · drag to pan · click a node',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fitView: 'Reset view',
  openInTab: 'Open in a new tab',
  searchPlaceholder: 'Find a plugin…',
  searchMatches: '{value} matched',
  searchNone: 'No match',
  provides: 'Provides',
  injects: 'Injects',
  injectsOptional: 'Injected at runtime',
  nothingProvides: 'Provides no services.',
  nothingInjects: 'Injects no services.',
  nothingInjectsOptional: 'Injects nothing at runtime.',
  optionalMark: 'optional',
  usedBy: 'Used by',
  dependsOn: 'Depends on',
  noUsedBy: 'Nothing depends on it.',
  noDependsOn: 'It depends on nothing in this composition.',
  unresolvedTitle: 'Unresolved dependencies',
  isolatedTitle: 'Isolated services',
  unresolvedNone: 'Every injected service has a provider.',
  isolatedNone: 'No service is provided under more than one isolation label.',
  stateActive: 'active',
  stateFailed: 'failed',
  stateOther: 'not loaded',
}

const zh: Record<MessagesKey, string> = {
  title: '插件依赖图',
  intro: '哪个插件提供了其他插件所注入的服务，数据读自运行中的 Cordis 运行时。',
  introClient: '浏览器侧是另一套 Cordis 运行时：不同的插件、不同的服务名。两张图不可比较、也不合并——合并出来的不是更大的图，而是错的图。',
  clientCollectedAt: '浏览器侧的树采集于 {when}。',
  scopeHost: '宿主',
  scopeClient: '浏览器',
  refresh: '刷新',
  loading: '正在读取运行时…',
  failed: '无法读取依赖图。',
  statPlugins: '{value} 个插件',
  statEdges: '{value} 条依赖',
  statUnresolved: '{value} 条未解析',
  sectionGraph: '依赖图',
  sectionDetail: '详情',
  selectHint: '点一个节点，看它提供什么、依赖什么。',
  graphHint: '滚轮缩放 · 拖拽平移 · 点击节点',
  zoomIn: '放大',
  zoomOut: '缩小',
  fitView: '重置视图',
  openInTab: '新标签页打开',
  searchPlaceholder: '查找插件…',
  searchMatches: '匹配 {value} 个',
  searchNone: '无匹配',
  provides: '提供',
  injects: '注入',
  injectsOptional: '运行时注入',
  nothingProvides: '不提供任何服务。',
  nothingInjects: '不注入任何服务。',
  nothingInjectsOptional: '运行时不注入任何服务。',
  optionalMark: '可选',
  usedBy: '被依赖',
  dependsOn: '依赖',
  noUsedBy: '没有插件依赖它。',
  noDependsOn: '在本组合里它不依赖任何插件。',
  unresolvedTitle: '未解析的依赖',
  isolatedTitle: '被隔离的服务',
  unresolvedNone: '每个被注入的服务都有提供者。',
  isolatedNone: '没有服务在多个隔离标签下提供。',
  stateActive: '已激活',
  stateFailed: '失败',
  stateOther: '未加载',
}

export { en, zh }

/**
 * Translate function bound to this plugin's namespace.
 *
 * Lives here rather than in the section so both halves of the UI — the section
 * chrome and the drawn canvas — take the same seat without one importing the
 * other's component module.
 */
export type Translate = (key: MessagesKey, params?: Record<string, unknown>) => string

/**
 * Register the namespace with the slot renderer.
 *
 * This merge is what puts the typed `t` seat on the section's props and what lets
 * the registration name `pluginGraph` as its locale: without it, cordis refuses
 * the registration outright rather than handing the section an unbound translate.
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    pluginGraph: MessagesKey
  }
}
