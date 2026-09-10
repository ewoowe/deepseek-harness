# dsh-session-messages

会话内消息查看器：在对话页面按组合键（默认 `Ctrl+S`）弹出**当前会话已加载的消息**列表，
上下方向键选择，`Enter` 或点击跳转到该条消息在 transcript 中的位置。

这是一个**独立安装到 profile 的插件**，不修改 `deepseek-harness` 的任何源码（`packages/` 未改动）。

## 目录

```text
session-messages-plugin/
  package.json        dsh.bundle + dsh.client 声明、exports 映射
  cordis.patch.yml    层补丁（把自己登记为 Loader 条目并给配置）
  build.mjs           构建脚本（tsdown 编程接口）
  tsconfig.json       仅用于 IDE 类型解析，指向 checkout 源码（只读）
  src/
    index.ts                  Node 半：Config Schema + 向页面注入配置
    shared.ts                 两半共享的配置形状与解析
    client/
      index.ts                浏览器半：注册到 shell.overlay 与设置卡片两个槽位
      overlay.tsx             浮层组件、消息采集与跳转
      session-totals.ts       页眉会话总计：读投影 + 紧凑格式化
      settings-card.tsx       设置页卡片（可折叠）
      settings-scope-holder.ts  卡片绑定的设置作用域 → 浮层的单向桥
      locales.ts              中英字典
  lib/                构建产物（index.js / client.js）
```

## 安装

```sh
# ① 构建（改了 src 就要重跑）—— 全程在仓库根执行
cd session-messages-plugin && npm run build && cd ..

# ② 安装到 profile（此时已回到仓库根）
pnpm dsh plugin --profile web add ./session-messages-plugin
```

构建也可用 `node_modules/.bin/tsx session-messages-plugin/build.mjs`（在仓库根执行，
不必进子目录）。注意这条依赖 `node_modules/.bin/` 下的 shell 桩，Windows 上没有它，
请用上面的 `npm run build`。

然后**重启** `pnpm dsh web`（新增 bundle 层、以及 bundle 内容变化，都需要重启）。

卸载：

```sh
pnpm dsh plugin --profile web remove dsh-session-messages
```

## 使用

| 操作 | 效果 |
| --- | --- |
| `Ctrl+S` | 打开／关闭消息列表 |
| `↑` `↓` | 移动高亮 |
| `Alt`+`↑` `↓`、`PageUp` `PageDown` | 翻页：列表滚一屏，高亮**停在原处**不动（到首尾时贴边）；`maxRows` 小到一页放得下时改为整页切换 |
| `Enter` | 跳转到高亮那条消息 |
| 鼠标移动 / 点击 | 移动高亮 / 跳转 |
| 滚轮 | 上下移动高亮，一格一行；触控板按累计行程换算成整行。方向由 `wheelInverted` 决定 |
| `Esc` | 关闭 |

翻页的 `Alt` 在 macOS 上就是 `⌥ Option`（同一个物理键，提示栏会按平台显示对应字样）；
MacBook 无独立翻页键时可用 `Fn`+`↑` `↓`，macOS 会把它转成 `PageUp`／`PageDown`。

## 配置

编辑 `cordis.patch.yml` 的 `config:` 块，或在 profile 自己的 `cordis.patch.yml`
里按 id `session-messages` 覆盖。快捷键**不是**写死在代码里的：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `key` | `s` | `KeyboardEvent.key` 的小写形式 |
| `ctrl` | `true` | 是否要求 Ctrl |
| `alt` | `false` | 是否要求 Alt |
| `shift` | `false` | 是否要求 Shift |
| `meta` | `false` | 是否要求 Meta（macOS Cmd / Win） |
| `wheelInverted` | `false` | 滚轮方向。关闭：向上滚动选上一条；开启：向上滚动选下一条 |
| `maxRows` | `50` | 列表同时渲染的最大条数；窗口跟随高亮整页移动，可当「每页 N 条」用 |

macOS 想用 `Cmd+S`：`ctrl: false`、`meta: true`。

## 在设置页里改（免改文件）

上面这些字段也能在界面上改，不必动 `cordis.patch.yml`：

**设置 → 插件 → 插件配置** → 「会话消息」（默认收起，点头部展开）

卡片列出唤出键、四个修饰键、滚轮方向、最大行数，逐项可调；有未保存改动时头部显示
「未保存」标记，保存成功后自动收起。改完无需重启。

设置页的值来自本插件登记的设置命名空间 `session-messages`（Node 半通过
`settings.installSection` 登记）。卡片能显示需要两件事同时成立：Host 的
`describe()` 里有这个命名空间，且浏览器侧注册了 key 同为 `session-messages` 的卡片。

## 消息列表从哪来

第三方插件拿不到 `ui-chat` 的 node store，所以列表从**已渲染的 DOM** 采集。
这不是 hack —— 这些属性都是 `ChatView` 自己用来定位的契约：

- `[data-conversation-scroll]` —— 滚动容器（`ChatView` 的 `scrollerOf` 就是查它）
- `[data-chat-flow-kind="user" | "steering"]` —— 一条人类消息行
- `[data-chat-anchor-key]` —— 行标识（`ChatView` 用同一个属性做滚动位置恢复）
- `[data-chat-turn]` —— 行所属的轮次
- `[data-turn-tail]` —— 该轮的轮尾，里面的用量/用时胶囊就在这

每行右侧的**用量**与**用时**不是自己算的，而是直接取该行所属轮次轮尾上那两个胶囊
（`TurnUsagePanel` / `TurnTimePanel`）的标签文本 —— 宿主已经把它格式化并本地化好了
（`消费 1.2k` / `用时 12.3s`，英文对应 `Consumed …` / `Ran for …`）。
胶囊类名是哈希的，所以按**契约位置**定位：轮尾里最后两个 `aria-haspopup="dialog"`
按钮依次是用量和用时，再用图标几何区分（用量是数据库图标，含 `<ellipse>`；用时是时钟图标，含 `<circle>`）。

跳转用的也是 `ChatView` 自己的算式：
`scrollTop += row.top - scrollport.top - 24`。

代价：**只能列出已加载窗口内的消息**。窗口外的由插件自己翻进来，无需手动操作：
打开时填充到 `maxRows` 条；高亮进入最旧 8 条以内时再预取一页（走 `ISession.loadOlder()`）。
预取不会为同一页重复触发——高亮按 id 记录，翻入 N 条后它的下标自动增大 N，脱离触发区。

## 页眉的会话总计

弹窗最上层是整场会话（不是已加载窗口）的三个数字：

```text
用时 2分42秒 · 用量 5.5K · 缓存命中 60%          已加载 30 条
```

它们**不是**从 DOM 抓的，而是读 `ISession.projections` —— 客户端公开的投影读取面
（`faceOf(key).getSnapshot()`），两个键都是宿主按**整条日志**算好的：

| 键 | 取用字段 | 页眉口径 |
| --- | --- | --- |
| `sessionStats` | `llmMs`、`toolMs` | `用时` = 模型请求 + 工具执行的总墙钟时间 |
| `tokenUsage` | `uncachedInputTokens`、`cacheReadTokens`、`cacheWriteTokens`、`outputTokens` | `用量` = 计费输入 + 输出；`缓存命中` = 缓存读取 / 计费输入 |

为什么不抓 DOM：这两个值不存在于任何可见文本里（会话时间只在统计弹窗内，且弹窗默认关闭），
而读数字还省掉了“把 `1.2K` 这类紧凑文本解析回数字”这一步。格式化按宿主同一套口径：
紧凑 token（`12.2K` / `1.2M`）、紧凑时长（`45.2s` / `2m42s`），
且**部分命中不四舍五入成 100%**（未全命中时最高显示 99.9）。

## 配置如何从 Node 半传到浏览器

启动图（boot graph）不携带 config，所以 Node 半监听 `webserver/index-inject`，
推入一行 `{ kind: 'global', name: '__DSH_SESSION_MESSAGES_CONFIG__', value: config }`；
浏览器半读取该 global，缺失时回退到同一份默认值。

## 实现要点

- **浮层落点**：`shell.overlay` 槽位（ui-layout 声明，frame 级、不拦截点击）。
  组件常驻挂载、关闭时返回 `null`，这样快捷键监听一直有效。
- **键盘用捕获阶段**：composer 是 Lexical 编辑器，以 `COMMAND_PRIORITY_CRITICAL`
  注册自己的按键命令；冒泡阶段监听会被它先吃掉。
- **`Ctrl+S` 必须 `preventDefault()`**：浏览器默认是「保存网页」。
- **滚轮监听必须原生且非 passive**：React 在根节点以 passive 方式注册 `onWheel`，
  在合成事件里 `preventDefault()` 拦不住列表自身滚动，结果高亮移动和列表滚动会叠加；
  所以直接对列表元素 `addEventListener('wheel', …, { passive: false })`。
- **客户端包必须是 CJS**：产物被包进 `window.__ModuleLoader__.load({ factory: (require) => {...} })`，
  函数体内不能出现 ESM `import`。tsdown CLI 因缺 `unrun` 起不来，改用 `build()` 编程接口并传 `config: false`。
- **所有裸导入保持 external**：浏览器从模块表解析，打包进副本会导致 cordis / react 实例身份与外壳分裂。

## 已知限制

- 只列已加载窗口内的消息；更早的由打开时的填充与接近最旧一条时的预取自动翻入，没有手动按钮。
- 消息预览取自行内文本（剥离行尾时间戳叶子），超长截断到 240 字符后再交给 CSS 省略号。
- 用量/用时取自该轮轮尾的胶囊：轮次还在进行、或该轮没有计时/用量时，对应位置留空。
- 页眉的会话总计在打开时、以及每翻入一页时重新读取（快照语义，与列表一致），不是实时订阅；轮次进行中时不会跳动。
- 只有 `sessionStats` 与 `tokenUsage` 两个投影**都**缺失时，页眉才只显示已加载条数；
  缺其中一个仍会显示另一个能算出的部分，不会显示 0。
- 会话切换后列表在下一次打开时重建（打开瞬间采集）。
- 浮层用了行内样式而非 CSS Modules：独立插件拿不到仓库的 tsdown CSS 预设。
- `node_modules/@types/react` 是指向仓库 pnpm store 的软链，只为 IDE 类型服务；
  `@types/react` 升级后需重链。
- IDE 会对 `cordis.patch.yml` 误报 JSONPatch schema 错误（仓库内同名文件不报），属误报。
