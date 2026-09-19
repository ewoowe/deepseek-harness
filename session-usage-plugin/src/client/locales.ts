/**
 * This plugin's namespaced strings.
 *
 * `zh` and `en` are the locales the shell ships, so they register together as
 * the typed `Record<BuiltInLocaleId, …>` form. The rest are language-pack
 * locales: the language pack the profile carries owns the DEFINITION that makes
 * them selectable, and this plugin only contributes its own namespace to each —
 * the single-locale overload that exists for exactly this. It deliberately does
 * not call `addLanguage`: that would throw against an existing definition.
 *
 * Every dictionary is typed `Record<MessagesKey, string>`, so a key added to the
 * union fails to compile until all seven translations exist. That matters more
 * than the fallback chain does: without it, a key forgotten in one language
 * resolves to English silently and only a reader of that language ever sees it.
 *
 * Wording follows `session-messages`' dictionaries, which already carry these
 * five languages — the two plugins sit in one interface, so a reader must meet
 * `使用量` / `사용량` / `Uso` / `Consommation` / `Verbrauch` in both. Where a
 * language inflects a count (`{count}` has no plural rules in the registry), the
 * label leads: `Turnos: {count}`, not `{count} turnos`.
 */

/** Locale namespace this plugin owns. */
export const NS = 'sessionUsage'

/** Every string this plugin renders; `t` resolves against this union. */
export type MessagesKey =
  | 'title'
  | 'totalsLabel'
  | 'tokensLabel'
  | 'busyLabel'
  | 'cacheLabel'
  | 'turnsLabel'
  | 'contextLabel'
  | 'contextPressure'
  | 'colModel'
  | 'colTurns'
  | 'colBusy'
  | 'colInput'
  | 'colOutput'
  | 'colCache'
  | 'modelUnknown'
  | 'empty'
  | 'attribution'
  | 'coverage'
  | 'loadAll'
  | 'outsideWindow'
  | 'noUsage'
  | 'loadAllHint'
  | 'loadAllAlso'
  | 'messageTitle'
  | 'modelTitle'
  | 'colTime'
  | 'colMessage'
  | 'noPrompt'
  | 'composerBlocked'
  // Time ranges. The labels name the window the reader is choosing, so they are
  // copy rather than numbers: "24 hours" and "3 days" are how each language
  // spells a span, not a value to interpolate into one pattern.
  | 'rangeSession'
  | 'rangeToday'
  | 'rangeDay'
  | 'rangeYesterday'
  | 'rangeDays3'
  | 'rangeDays7'
  | 'rangeGap'
  | 'loadRange'
  | 'loadRangeHint'
  // Exports: four buttons, and the labels a Markdown transcript needs.
  | 'exportCsv'
  | 'exportJson'
  | 'exportMd'
  | 'exportJsonl'
  | 'transcriptTitle'
  | 'sessionLabel'
  | 'exportedAt'
  | 'promptLabel'
  | 'responseLabel'
  | 'rangeCustom'
  | 'rangeFrom'
  | 'rangeTo'
  | 'rangeUntil'
  | 'rangeEmpty'
  // Compact number and duration units. Not copy of their own: they are how this
  // plugin's figures are spelled, and every language spells them its own way.
  | 'numberThousand'
  | 'numberMillion'
  | 'durationSeconds'
  | 'durationMinutes'

/** Simplified Chinese, the shell's own Chinese. */
export const zh: Record<MessagesKey, string> = {
  title: '用量',
  modelTitle: '模型用量统计',
  totalsLabel: '本会话合计',
  tokensLabel: '用量 {value}',
  busyLabel: '用时 {value}',
  cacheLabel: '缓存命中 {percent}%',
  turnsLabel: '{count} 轮',
  contextLabel: '上下文',
  contextPressure: '已用 {percent}%',
  colModel: '模型',
  colTurns: '轮次',
  colBusy: '用时',
  colInput: '输入',
  colOutput: '输出',
  colCache: '缓存命中',
  modelUnknown: '未知模型',
  empty: '这个会话还没有可统计的轮次',
  attribution: '一轮里换过模型时，整轮记在产出回复的那个模型上。',
  coverage: '已统计 {covered} / {total} 轮',
  loadAll: '载入全部历史',
  outsideWindow: '· 其中 {count} 轮不在已加载窗口',
  noUsage: '· 其中 {count} 轮还没有完整用量记录（正在运行或曾中断）',
  loadAllAlso: '会把消息一并载入对话视图',
  loadAllHint: '把整段会话的历史载入同一个事件窗口。对话视图会随之加载全部消息，行数增多后浮条与弹窗的逐行测量会变慢；载入不回缩——刷新前一直有效，且无法中途取消。正在进行的轮次要等它结束后才会出现用量。',
  messageTitle: '消息用量统计',
  colTime: '时间',
  colMessage: '消息',
  noPrompt: '（无可读提示词）',
  composerBlocked: '用量视图不接收输入，切回「对话」即可继续',
  rangeSession: '本会话',
  rangeToday: '今天',
  rangeDay: '24 小时',
  rangeYesterday: '昨天',
  rangeDays3: '3 天',
  rangeDays7: '7 天',
  rangeGap: '· 更早的轮次还没载入',
  exportCsv: '统计 CSV',
  exportJson: '统计 JSON',
  exportMd: '对话 MD',
  exportJsonl: '对话 JSONL',
  transcriptTitle: '对话记录',
  sessionLabel: '会话',
  exportedAt: '导出时间',
  promptLabel: '问',
  responseLabel: '答',
  loadRange: '载入范围内更早的历史',
  loadRangeHint: '逐页把更早的轮次载入，直到覆盖所选时间段的起点。载入的是消息本体，宿主无法卸载——载进来就一直留着，只能靠刷新页面回到较短的窗口。',
  rangeCustom: '自定义',
  rangeFrom: '起始时间',
  rangeTo: '至',
  rangeUntil: '结束时间',
  rangeEmpty: '没有落在所选时间段内的轮次',
  numberThousand: '{value}K',
  numberMillion: '{value}M',
  durationSeconds: '{seconds}秒',
  durationMinutes: '{minutes}分{seconds}秒',
}

/** English, the source of truth for new keys. */
export const en: Record<MessagesKey, string> = {
  title: 'Usage',
  modelTitle: 'Model usage',
  totalsLabel: 'This session',
  tokensLabel: 'Used {value}',
  busyLabel: 'Ran for {value}',
  cacheLabel: 'Cache hit {percent}%',
  turnsLabel: '{count} turns',
  contextLabel: 'Context',
  contextPressure: '{percent}% full',
  colModel: 'Model',
  colTurns: 'Turns',
  colBusy: 'Wall time',
  colInput: 'Input',
  colOutput: 'Output',
  colCache: 'Cache hit',
  modelUnknown: 'Unknown model',
  empty: 'This session has no completed turns yet',
  attribution: 'A turn that switched models is credited to the one that produced the reply.',
  coverage: 'Folded {covered} of {total} turns',
  loadAll: 'Load the full history',
  outsideWindow: '· {count} outside the loaded window',
  noUsage: '· {count} with no complete usage record yet (running or interrupted)',
  loadAllAlso: 'also loads the messages into the conversation view',
  loadAllHint: 'Loads the whole session into the same event window. The conversation view loads all its messages along with it, so the strip and the dialog measure more rows and get slower; the load does not shrink back — it holds until the page is reloaded — and it cannot be cancelled. A turn still running shows its usage once it ends.',
  messageTitle: 'Message usage',
  colTime: 'When',
  colMessage: 'Message',
  noPrompt: '(no readable prompt)',
  composerBlocked: 'The usage view takes no input — switch back to Conversation to type',
  rangeSession: 'Session',
  rangeToday: 'Today',
  rangeDay: '24 hours',
  rangeYesterday: 'Yesterday',
  rangeDays3: '3 days',
  rangeDays7: '7 days',
  rangeGap: '· older turns are not loaded yet',
  exportCsv: 'Stats CSV',
  exportJson: 'Stats JSON',
  exportMd: 'Chat MD',
  exportJsonl: 'Chat JSONL',
  transcriptTitle: 'Conversation',
  sessionLabel: 'Session',
  exportedAt: 'Exported',
  promptLabel: 'Prompt',
  responseLabel: 'Response',
  loadRange: 'Load the older turns in this range',
  loadRangeHint: 'Pages older turns in until the window covers the start of the chosen span. What arrives is message bodies, and the host cannot unload them — they stay loaded, and only a page reload returns to a shorter window.',
  rangeCustom: 'Custom',
  rangeFrom: 'From',
  rangeTo: 'to',
  rangeUntil: 'Until',
  rangeEmpty: 'No turns fall inside the chosen span',
  numberThousand: '{value}K',
  numberMillion: '{value}M',
  durationSeconds: '{seconds}s',
  durationMinutes: '{minutes}m{seconds}s',
}

/** Japanese. Terminology follows `session-messages`' own dictionary. */
const ja: Record<MessagesKey, string> = {
  title: '使用量',
  modelTitle: 'モデル別の使用量',
  totalsLabel: 'このセッションの合計',
  tokensLabel: '使用量 {value}',
  busyLabel: '所要時間 {value}',
  cacheLabel: 'キャッシュ率 {percent}%',
  // No plural agreement to worry about, so this one can lead with the count.
  turnsLabel: '{count} ターン',
  contextLabel: 'コンテキスト',
  contextPressure: '{percent}% 使用中',
  colModel: 'モデル',
  colTurns: 'ターン',
  colBusy: '所要時間',
  colInput: '入力',
  colOutput: '出力',
  colCache: 'キャッシュ率',
  modelUnknown: '不明なモデル',
  empty: 'このセッションにはまだ集計できるターンがありません',
  attribution: 'モデルを切り替えたターンは、応答を生成したモデルに計上されます。',
  coverage: '{covered} / {total} ターンを集計',
  loadAll: '全履歴を読み込む',
  outsideWindow: '· {count} ターンが読み込み済みウィンドウ外',
  noUsage: '· {count} ターンにまだ完全な使用量記録がありません（実行中または中断）',
  loadAllAlso: 'メッセージも対話ビューに読み込まれます',
  loadAllHint: 'セッション全体を同じイベントウィンドウに読み込みます。対話ビューもすべてのメッセージを読み込むため、一覧バーとダイアログの行数が増えて計測が遅くなります。読み込みは縮小できません——ページを再読み込みするまで保持され、途中では取り消せません。実行中のターンの使用量は、終了後に表示されます。',
  messageTitle: 'メッセージ別の使用量',
  colTime: '時刻',
  colMessage: 'メッセージ',
  noPrompt: '（読み取り可能なプロンプトなし）',
  composerBlocked: '使用量ビューは入力を受け付けません。「対話」に戻ると入力できます',
  rangeSession: 'このセッション',
  rangeToday: '今日',
  rangeDay: '24 時間',
  rangeYesterday: '昨日',
  rangeDays3: '3 日',
  rangeDays7: '7 日',
  rangeGap: '· より古いターンはまだ読み込まれていません',
  exportCsv: '統計 CSV',
  exportJson: '統計 JSON',
  exportMd: '対話 MD',
  exportJsonl: '対話 JSONL',
  transcriptTitle: '対話記録',
  sessionLabel: 'セッション',
  exportedAt: '書き出し日時',
  promptLabel: '質問',
  responseLabel: '回答',
  loadRange: 'この範囲のより古い履歴を読み込む',
  loadRangeHint: '選択した期間の起点を覆うまで、古いターンをページ単位で読み込みます。読み込まれるのはメッセージ本体で、ホスト側からは破棄できません——読み込んだ分は残り、短いウィンドウに戻すにはページの再読み込みが必要です。',
  rangeCustom: 'カスタム',
  rangeFrom: '開始時刻',
  rangeTo: '〜',
  rangeUntil: '終了時刻',
  rangeEmpty: '選択した期間内にターンがありません',
  numberThousand: '{value}K',
  numberMillion: '{value}M',
  durationSeconds: '{seconds}秒',
  durationMinutes: '{minutes}分{seconds}秒',
}

/** Korean. Terminology follows `session-messages`' own dictionary. */
const ko: Record<MessagesKey, string> = {
  title: '사용량',
  modelTitle: '모델별 사용량',
  totalsLabel: '이 세션 합계',
  tokensLabel: '사용량 {value}',
  busyLabel: '소요 시간 {value}',
  cacheLabel: '캐시 적중률 {percent}%',
  turnsLabel: '{count}턴',
  contextLabel: '컨텍스트',
  contextPressure: '{percent}% 사용 중',
  colModel: '모델',
  colTurns: '턴',
  colBusy: '소요 시간',
  colInput: '입력',
  colOutput: '출력',
  colCache: '캐시 적중률',
  modelUnknown: '알 수 없는 모델',
  empty: '이 세션에는 아직 집계할 수 있는 턴이 없습니다',
  attribution: '모델을 전환한 턴은 응답을 생성한 모델로 집계됩니다.',
  coverage: '턴 {total}개 중 {covered}개 집계',
  loadAll: '전체 기록 로드',
  outsideWindow: '· {count}턴이 로드된 창 밖에 있음',
  noUsage: '· {count}턴에 아직 완전한 사용량 기록이 없음(실행 중 또는 중단됨)',
  loadAllAlso: '메시지도 대화 보기에 함께 로드됩니다',
  loadAllHint: '세션 전체를 같은 이벤트 창에 로드합니다. 대화 보기도 모든 메시지를 함께 로드하므로 목록 바와 대화상자가 측정할 행이 늘어 느려집니다. 로드는 되돌릴 수 없습니다——페이지를 새로 고칠 때까지 유지되며 중간에 취소할 수 없습니다. 실행 중인 턴의 사용량은 끝난 뒤에 표시됩니다.',
  messageTitle: '메시지별 사용량',
  colTime: '시각',
  colMessage: '메시지',
  noPrompt: '(읽을 수 있는 프롬프트 없음)',
  composerBlocked: '사용량 보기는 입력을 받지 않습니다. 「대화」로 돌아가면 입력할 수 있습니다',
  rangeSession: '이 세션',
  rangeToday: '오늘',
  rangeDay: '24시간',
  rangeYesterday: '어제',
  rangeDays3: '3일',
  rangeDays7: '7일',
  rangeGap: '· 이전 턴이 아직 로드되지 않았습니다',
  exportCsv: '통계 CSV',
  exportJson: '통계 JSON',
  exportMd: '대화 MD',
  exportJsonl: '대화 JSONL',
  transcriptTitle: '대화 기록',
  sessionLabel: '세션',
  exportedAt: '내보낸 시각',
  promptLabel: '질문',
  responseLabel: '답변',
  loadRange: '이 범위의 이전 기록 로드',
  loadRangeHint: '선택한 기간의 시작점을 덮을 때까지 이전 턴을 페이지 단위로 로드합니다. 로드되는 것은 메시지 본문이며 호스트가 해제할 수 없습니다——로드된 분은 남고, 짧은 창으로 돌아가려면 페이지를 새로 고쳐야 합니다.',
  rangeCustom: '사용자 지정',
  rangeFrom: '시작 시각',
  rangeTo: '~',
  rangeUntil: '종료 시각',
  rangeEmpty: '선택한 기간에 해당하는 턴이 없습니다',
  numberThousand: '{value}K',
  numberMillion: '{value}M',
  durationSeconds: '{seconds}초',
  durationMinutes: '{minutes}분 {seconds}초',
}

/** Spanish. Terminology follows `session-messages`' own dictionary. */
const es: Record<MessagesKey, string> = {
  title: 'Uso',
  modelTitle: 'Uso por modelo',
  totalsLabel: 'Total de la sesión',
  tokensLabel: 'Uso {value}',
  busyLabel: 'Tiempo {value}',
  cacheLabel: 'Aciertos de caché {percent}%',
  // Label-first, like the count in `session-messages`: the registry carries no
  // plural rules, so `{count} turnos` would read "1 turnos".
  turnsLabel: 'Turnos: {count}',
  contextLabel: 'Contexto',
  contextPressure: '{percent}% en uso',
  colModel: 'Modelo',
  colTurns: 'Turnos',
  colBusy: 'Tiempo',
  colInput: 'Entrada',
  colOutput: 'Salida',
  colCache: 'Aciertos de caché',
  modelUnknown: 'Modelo desconocido',
  empty: 'Esta sesión aún no tiene turnos que contabilizar',
  attribution: 'Un turno que cambió de modelo se atribuye al que produjo la respuesta.',
  coverage: 'Turnos contabilizados: {covered} de {total}',
  loadAll: 'Cargar todo el historial',
  outsideWindow: '· {count} fuera de la ventana cargada',
  noUsage: '· {count} sin registro de uso completo todavía (en ejecución o interrumpidos)',
  loadAllAlso: 'también carga los mensajes en la vista de conversación',
  loadAllHint: 'Carga la sesión entera en la misma ventana de eventos. La vista de conversación carga también todos sus mensajes, así que la barra y el diálogo miden más filas y van más lentos; la carga no se reduce — se mantiene hasta recargar la página — y no se puede cancelar. Un turno en ejecución muestra su uso cuando termina.',
  messageTitle: 'Uso por mensaje',
  colTime: 'Cuándo',
  colMessage: 'Mensaje',
  noPrompt: '(sin prompt legible)',
  composerBlocked: 'La vista de uso no acepta entrada: vuelve a Conversación para escribir',
  rangeSession: 'Sesión',
  rangeToday: 'Hoy',
  rangeDay: '24 horas',
  rangeYesterday: 'Ayer',
  rangeDays3: '3 días',
  rangeDays7: '7 días',
  rangeGap: '· los turnos anteriores aún no están cargados',
  exportCsv: 'Estadísticas CSV',
  exportJson: 'Estadísticas JSON',
  exportMd: 'Conversación MD',
  exportJsonl: 'Conversación JSONL',
  transcriptTitle: 'Registro de la conversación',
  sessionLabel: 'Sesión',
  exportedAt: 'Exportado',
  promptLabel: 'Pregunta',
  responseLabel: 'Respuesta',
  loadRange: 'Cargar los turnos anteriores de este intervalo',
  loadRangeHint: 'Carga turnos anteriores página a página hasta cubrir el inicio del intervalo elegido. Lo que llega son cuerpos de mensajes, y el host no puede descargarlos: se quedan cargados, y solo recargar la página vuelve a una ventana más corta.',
  rangeCustom: 'Personalizado',
  rangeFrom: 'Desde',
  rangeTo: 'a',
  rangeUntil: 'Hasta',
  rangeEmpty: 'Ningún turno cae dentro del intervalo elegido',
  numberThousand: '{value}K',
  numberMillion: '{value}M',
  durationSeconds: '{seconds} s',
  durationMinutes: '{minutes} min {seconds} s',
}

/** French. Terminology follows `session-messages`' own dictionary. */
const fr: Record<MessagesKey, string> = {
  title: 'Consommation',
  modelTitle: 'Consommation par modèle',
  totalsLabel: 'Total de la session',
  tokensLabel: 'Consommation {value}',
  busyLabel: 'Durée {value}',
  cacheLabel: 'Taux de cache {percent}%',
  // Label-first, same reason as the Spanish entry above.
  turnsLabel: 'Tours : {count}',
  contextLabel: 'Contexte',
  contextPressure: '{percent}% utilisé',
  colModel: 'Modèle',
  colTurns: 'Tours',
  colBusy: 'Durée',
  colInput: 'Entrée',
  colOutput: 'Sortie',
  colCache: 'Taux de cache',
  modelUnknown: 'Modèle inconnu',
  empty: 'Cette session n’a pas encore de tours à comptabiliser',
  attribution: 'Un tour ayant changé de modèle est attribué à celui qui a produit la réponse.',
  coverage: 'Tours comptabilisés : {covered} sur {total}',
  loadAll: 'Charger tout l’historique',
  outsideWindow: '· {count} hors de la fenêtre chargée',
  noUsage: '· {count} sans relevé d’usage complet pour l’instant (en cours ou interrompus)',
  loadAllAlso: 'charge aussi les messages dans la vue Conversation',
  loadAllHint: 'Charge la session entière dans la même fenêtre d’événements. La vue Conversation charge aussi tous ses messages : la barre et la boîte de dialogue mesurent plus de lignes et ralentissent ; le chargement ne se réduit pas — il tient jusqu’au rechargement de la page — et ne peut pas être annulé. Un tour en cours affiche son usage lorsqu’il se termine.',
  messageTitle: 'Consommation par message',
  colTime: 'Quand',
  colMessage: 'Message',
  noPrompt: '(aucun prompt lisible)',
  composerBlocked: 'La vue Consommation n’accepte pas la saisie : revenez à Conversation pour écrire',
  rangeSession: 'Session',
  rangeToday: 'Aujourd’hui',
  rangeDay: '24 heures',
  rangeYesterday: 'Hier',
  rangeDays3: '3 jours',
  rangeDays7: '7 jours',
  rangeGap: '· les tours antérieurs ne sont pas encore chargés',
  exportCsv: 'Statistiques CSV',
  exportJson: 'Statistiques JSON',
  exportMd: 'Conversation MD',
  exportJsonl: 'Conversation JSONL',
  transcriptTitle: 'Journal de conversation',
  sessionLabel: 'Session',
  exportedAt: 'Exporté le',
  promptLabel: 'Question',
  responseLabel: 'Réponse',
  loadRange: 'Charger les tours antérieurs de cet intervalle',
  loadRangeHint: 'Charge les tours antérieurs page par page jusqu’à couvrir le début de l’intervalle choisi. Ce qui arrive, ce sont des corps de messages, et l’hôte ne peut pas les décharger : ils restent chargés, et seul un rechargement de la page revient à une fenêtre plus courte.',
  rangeCustom: 'Personnalisé',
  rangeFrom: 'Du',
  rangeTo: 'au',
  rangeUntil: 'Jusqu’au',
  rangeEmpty: 'Aucun tour ne tombe dans l’intervalle choisi',
  numberThousand: '{value}K',
  numberMillion: '{value}M',
  durationSeconds: '{seconds} s',
  durationMinutes: '{minutes} min {seconds} s',
}

/** German. Terminology follows `session-messages`' own dictionary. */
const de: Record<MessagesKey, string> = {
  title: 'Verbrauch',
  modelTitle: 'Verbrauch pro Modell',
  totalsLabel: 'Summe dieser Sitzung',
  tokensLabel: 'Verbrauch {value}',
  busyLabel: 'Dauer {value}',
  cacheLabel: 'Cache-Treffer {percent}%',
  // Label-first, like the count in `session-messages`: `{count} Runden` would
  // read "1 Runden" and the registry cannot inflect it.
  turnsLabel: 'Runden: {count}',
  contextLabel: 'Kontext',
  contextPressure: '{percent}% belegt',
  colModel: 'Modell',
  colTurns: 'Runden',
  colBusy: 'Dauer',
  colInput: 'Eingabe',
  colOutput: 'Ausgabe',
  colCache: 'Cache-Treffer',
  modelUnknown: 'Unbekanntes Modell',
  empty: 'Diese Sitzung hat noch keine Runden zum Auswerten',
  attribution: 'Eine Runde, die das Modell gewechselt hat, wird dem Modell zugerechnet, das die Antwort erzeugt hat.',
  coverage: 'Erfasste Runden: {covered} von {total}',
  loadAll: 'Die gesamte Historie laden',
  outsideWindow: '· {count} außerhalb des geladenen Fensters',
  noUsage: '· {count} noch ohne vollständige Verbrauchsaufzeichnung (laufend oder unterbrochen)',
  loadAllAlso: 'lädt die Nachrichten auch in die Konversationsansicht',
  loadAllHint: 'Lädt die ganze Sitzung in dasselbe Ereignisfenster. Die Konversationsansicht lädt damit alle ihre Nachrichten mit, sodass Leiste und Dialog mehr Zeilen messen und langsamer werden; das Laden schrumpft nicht zurück — es gilt bis zum Neuladen der Seite — und lässt sich nicht abbrechen. Eine noch laufende Runde zeigt ihren Verbrauch, sobald sie endet.',
  messageTitle: 'Verbrauch pro Nachricht',
  colTime: 'Wann',
  colMessage: 'Nachricht',
  noPrompt: '(kein lesbarer Prompt)',
  composerBlocked: 'Die Verbrauchsansicht nimmt keine Eingabe an — zum Tippen zurück zu „Konversation“ wechseln',
  rangeSession: 'Sitzung',
  rangeToday: 'Heute',
  rangeDay: '24 Stunden',
  rangeYesterday: 'Gestern',
  rangeDays3: '3 Tage',
  rangeDays7: '7 Tage',
  rangeGap: '· ältere Runden sind noch nicht geladen',
  exportCsv: 'Statistik CSV',
  exportJson: 'Statistik JSON',
  exportMd: 'Konversation MD',
  exportJsonl: 'Konversation JSONL',
  transcriptTitle: 'Konversationsprotokoll',
  sessionLabel: 'Sitzung',
  exportedAt: 'Exportiert',
  promptLabel: 'Frage',
  responseLabel: 'Antwort',
  loadRange: 'Die älteren Runden in diesem Zeitraum laden',
  loadRangeHint: 'Lädt ältere Runden Seite für Seite, bis das Fenster den Anfang des gewählten Zeitraums abdeckt. Was ankommt, sind Nachrichtenkörper, und der Host kann sie nicht entladen — sie bleiben geladen, und nur ein Neuladen der Seite führt zu einem kürzeren Fenster zurück.',
  rangeCustom: 'Benutzerdefiniert',
  rangeFrom: 'Von',
  rangeTo: 'bis',
  rangeUntil: 'Bis',
  rangeEmpty: 'Keine Runden fallen in den gewählten Zeitraum',
  numberThousand: '{value}K',
  numberMillion: '{value}M',
  durationSeconds: '{seconds} s',
  durationMinutes: '{minutes} min {seconds} s',
}

/**
 * The dictionaries beyond the two the shell ships, keyed by language-pack
 * locale id. Every one of them falls back to `en`, so a key missing here would
 * still resolve rather than print itself — which is exactly why the shared
 * `Record<MessagesKey, string>` type matters more than the fallback does.
 */
const PACK_LOCALES: Readonly<Record<string, Record<MessagesKey, string>>> = { ja, ko, es, fr, de }

export { PACK_LOCALES }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for the session usage view. */
    sessionUsage: MessagesKey
  }
}
