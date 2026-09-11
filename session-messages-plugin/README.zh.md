# dsh-session-messages

会话内消息查看器，两块功能：

1. **消息列表**（默认 `Ctrl+S`）：弹出**当前会话已加载的消息**列表，上下方向键选择，
   `Enter` 或点击跳转到该条消息在 transcript 中的位置。
2. **视口浮条**（可选，默认关闭）：会话标题栏**正中间**的一条，实时显示你**正在读的那条
   消息**及其时钟、用量、用时。见「[视口浮条](#视口浮条)」。

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
      transcript.ts           transcript DOM 契约层（两个消费者共用的采集原语）
      overlay.tsx             列表浮层组件、消息采集与跳转
      hud.tsx                 视口浮条（注册进会话标题栏的动作座位）
      use-messages-config.ts  解析当前配置（设置作用域 → 退化到页面全局）
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
| `showHud` | `false` | 是否在会话标题栏里显示视口浮条（见下节）。默认关闭 |

macOS 想用 `Cmd+S`：`ctrl: false`、`meta: true`。

## 在设置页里改（免改文件）

上面这些字段也能在界面上改，不必动 `cordis.patch.yml`：

**设置 → 插件 → 插件配置** → 「会话消息」（默认收起，点头部展开）

卡片列出唤出键、四个修饰键、滚轮方向、最大行数，逐项可调；有未保存改动时头部显示
「未保存」标记，保存成功后自动收起。改完无需重启。

设置页的值来自本插件登记的设置命名空间 `session-messages`（Node 半通过
`settings.installSection` 登记）。卡片能显示需要两件事同时成立：Host 的
`describe()` 里有这个命名空间，且浏览器侧注册了 key 同为 `session-messages` 的卡片。

## 视口浮条

开关是 `showHud`（设置页里的「显示视口浮条」，或 `cordis.patch.yml`）。开启后在
**会话标题栏的正中间**出现一块，随滚动实时更新：

```text
21:36 · deepseek-chat  数据来源：读投影，不抓 DOM：关键是从客户端公开的
                       projections.faceOf 读，而不是去抓渲染出来的 DOM。
                                        消费 1.2k · 用时 12.3s · 缓存命中 99%
```

（左右两端其实是两个**描边小胶囊**：「何时 · 用哪个」和「花了多少」。正文最多 3 行，
与它们并排在同一行——纯文本写不出这个效果，见下面「两旁的内容用 `Tag`」。）

是**标题栏的正中**，不是视口的正中——它注册进 `conversation.session.header.actions`
（宿主为「标题旁的会话动作」声明的座位，`ui-agent-preset` 的模式标签和 `ui-jobs`
的任务列表用的是同一个），但**不按座位排队**，而是把自己移出文档流，居中在标题行上。

### 怎么做到居中的

两个轴都对着 **header 盒子本身**：水平是它的中线，垂直也是它的中线。

**水平** —— 纯 CSS。`position: absolute` 的包含块是 ui-conversation 的 `.root`，它声明了
`position: relative`，注释写明的用途就是 `positioning context for slot-owned absolute
chrome`。header 横跨整列，所以 `.root` 的 50% 就是 header 自己的中线；左侧栏收起或展开时
都不会偏，而视口的 50% 会。

**垂直** —— 测量 `<header>` 自己，取它的中线。浮条脱离文档流，CSS 里没有任何东西知道
header 的盒子在哪，所以必须量。

锚在 **header** 而不是标题行，因为「浮层居中」指的就是这条 header 盒子：它除了标题行，
下面还挂着「对话／轨迹」页签，比第一行高得多。锚在标题行会让浮条明显偏高——那是第二版。

两条试错记录，避免重犯：

| 试过 | 结果 |
|---|---|
| `top: auto` 的**静态位置** | 规范说 flex 容器的绝对定位子元素「如同它是唯一 flex item」那样排布，理应吃到 `align-items: center`。**实测落在包含块顶边**，浮条被窗口裁掉。 |
| 锚座位自己的盒子 | 哪个盒子会塌缩取决于组合——`headerActions` 在浮条是它唯一子元素时高度为 0，corner 空时 `display: none`——于是要一串候选兜底。而 header 是一个永远在的元素，白绕。 |

移出文档流也是能居中的前提：座位的 `headerActions` 是 `flex: none`，而这一行的自由空间握在
`titleCluster`（`flex: 1`）手里，**留在座位里的普通元素永远到不了中间**。

`top` 写的是**元素上沿**、transform 只做水平，所以万一测量没跑，浮条退回静态位置仍然可见，
不会被拉出屏幕——第一版用 `translate(-50%, -50%)`，同样情况下整个消失。

`top` 是直接写节点、不走 React state 的：它是布局的函数，走 state 就等于在测量它的那个
帧循环里再塞一次 setState。

### 外观是抄的，不是设计的

抄的是同一个座位里那个模式标签的配方（`AgentPresetLabel.module.css`）：

| 属性 | 值 | 与模式标签 |
|---|---|---|
| `border-radius` | `6px` | 一样的圆角矩形，**不是药丸** |
| `background` | `var(--dsw-alias-fill-tsp-secondary)` | 同一个半透明 fill，不是 `bg-layer-*` |
| `color` | `var(--dsw-alias-label-secondary)` | 同一层文字色 |
| `min-height` | `22px` | 下限同高；**不再固定高度**，见下 |

第一版用的是「999 圆角 + 硬边框 + `bg-layer-3` + `label-primary`」——header 自己的任何
chrome 都不是这么做的，于是看起来像贴上去的一张卡片。**要融进一块 UI，先抄它已有的配方，
别自己发明一套。**

### 正文按可读的字号排版，不是按 chip

一处**刻意偏离**模式标签：消息正文用 14px / 20px（与 transcript 正文同号）并允许换行、
最多 3 行，而不是 chip 的 12px 单行。因为这是拿来**读**的，不是拿来扫的标签。

- 容器因此是 `min-height` 而非固定 `height`，随行数长高。
- 预览字符上限 `MAX_HUD_CHARS = 500`，视觉上限由 3 行的 `-webkit-line-clamp` 兜底——
  上限给得宽是因为窄字符（拉丁文）在同样三行里能装下更多，切早了反而少显示。
  `overlay.tsx` 的行预览用的是同一套 `-webkit-box` 三段式。

### 两旁的内容用 `Tag`，不是"看起来像 Tag"

时钟和用量/用时是宿主的 **`Tag` 原语**（`tone="outline"`），不是自己用 span 摆出来的。
`Tag` 自带几何（999 圆角、`1px 8px`、11px/17px、`nowrap`）与配色
（`0.5px solid var(--dsw-alias-border-l4)` + `label-tertiary`），所以这里一个字都不用重述。

为什么必须这么改：之前三部分都是纯文字 + 同一个底色，**读者没法一眼看出消息从哪儿开始**。
描边胶囊是"元信息"的视觉语言，正文不是——一层对比就分开了。

顺带两个不用操心的点：

- `Tag` 的盒子含发丝边框正好 20px，与正文 14px/20px 的首行盒同高：**单行消息**时两侧胶囊
  无需任何微调就与正文齐平。
- 消息换行时靠容器的 `alignItems: center` 保持居中——两个胶囊对**整个消息块**取中，
  而不是挂在它的第一行上（那样在双行预览旁边看起来像胶囊往上飘了）。
- 用 `Tag` 组件而不是抄它的 CSS：它从模块表里 require（external），拿到的就是宿主**已经
  加载的那份**，样式天然一致、也不会随宿主改版漂移。

**三个部分一律居中**，靠两件事同时成立：

- 正文 `flex: 0 1 auto`——**可以缩，但不许长**。让它长（`1 1 auto`）会让浮条永远等于
  `maxWidth`，把时钟顶到左端、数字顶到右端：三个部分钉在一个宽盒子的两端，怎么看都不是
  居中。不给它长，浮条就贴着内容，三者自然聚成一组。
- 容器 `textAlign: center`，让换行后的正文各行居中，而不是左对齐。

### 显示什么：五个字段，两种粒度

胶囊的分工是「何时、用哪个」在左，「花了多少」在右：

| 字段 | 粒度 | 来源 |
|---|---|---|
| 时钟 | 该条消息 | 行内 `IconActions` 的标签 |
| 消息正文 | 该条消息 | 行内文本（剥离行尾时间戳叶子） |
| 用量 / 用时 | **该轮** | 该轮轮尾的那两个胶囊 |
| 模型 | **整场会话** | `modelSelection` 投影的 `lastUsed`（退化到 `next`） |
| 缓存命中 | **整场会话** | `tokenUsage` 投影：`cacheRead / (uncachedInput + cacheRead + cacheWrite)` |

后两个是会话级的——**这不是取舍，是约束**。轮次级的模型与缓存命中在客户端确实存在
（`ui-chat` 在浏览器里用 `deriveTurnTokenUsage` 折叠出来，带 `routes[{provider,model}]`
和 `cacheReadTokens`），但它们只挂在 `turn-tail` 的 **node data** 上：第三方插件够不到
node store，而唯一渲染它们的用量弹窗只在**点击展开时**才 portal 挂载。

口径与宿主一致：缓存命中的分母是**计费输入三桶之和**（与宿主 `StatsPills` 的
`billedInputTokens` 相同），百分比沿用本插件页眉那套「部分命中不四舍五入成 100%」。

模型只显示 **id**（如 `deepseek-chat`），不是展示名：展示名在模型目录 service 里，
那是个会惰性创建 per-session 状态、并对不在活动列表里的会话抛错的**选择面**，
不该为一个只读标签拉进来。

宽度上限因此是 `min(760px, 58vw)`，而不是更窄的值——**胶囊不可压缩**，
上限太窄会先挤掉正文，而那正是这条浮条存在的意义。

`pointer-events: none` 是因为它可能压到长标题的尾部，不能吃掉点击。

顺带免费得到的：会话空白时 header 整体 `display: none`，浮条作为后代一起消失，
插件不需要自己判断会话状态。

四个字段全部来自该行与所在轮的既有契约，插件不自己算任何数字：文本取自行内文本
（剥离行尾时间戳叶子），时钟是 `IconActions` 的标签，用量与用时是该轮轮尾的那两个胶囊——
与列表行里显示的是同一份数据源。

### 「正在读的那条」怎么判定

取**最后一条到达视口顶部「锚带」的行**，而不是「第一条还在屏幕里的行」。

理由是实测的：一条用户消息只有一行高，它的回答却可能有几屏。若按「还在屏幕里」判定，
读长回答时用户消息早已滚出视口，浮条就会**大段空白**——那看起来像坏了，而不是像没内容。
按「已到达锚带」判定则像粘性小标题：一直显示你正在读的这条，直到下一条到达锚带。
全部行都还在锚带之下时（读者在第一条之上），回退到第一条。

**锚带（`FOLD_BAND_PX`）不是 0，这点很关键。** 它是「视口上沿 + `LAND_OFFSET_PX` + 2px」：

- `landOnRow` 把跳转目标**落在视口上沿下方 `LAND_OFFSET_PX`（24px）处**——那点呼吸空间正是
  它存在的意义。若判定写成严格的「已跨过上沿」（`top < viewTop`），目标行**还没跨过**，
  浮条就会显示**上一条**：每次跳转都慢一条。
- `+2px` 是亚像素余量：落点量出来是 24.0000…，用裸 `<` 会被卡掉。
- 锚带变宽还让滚动时浮条**稍微早一点**翻到下一条——这个方向本身就是想偏的。

`LAND_OFFSET_PX` 因此从 `overlay.tsx` 提到了 `transcript.ts`（两者共用的契约层）：
跳转的落点算术和浮条的判定带宽本来就是同一件事，各写一份必然发散。

要改回严格可见判定，改 `hud.tsx` 的 `rowUnderFold` 一处即可。

### 为什么它比列表便宜

浮条跑在滚动帧上，所以走的是另一条采集路径（`transcript.ts` 是两者共用的契约层）：

- **不克隆整屏**。列表每次采集 `cloneNode` 每一行；浮条只解析视口那**一行**，并按行 id
  缓存结果——同一轮内滚动，克隆次数为 0。
- **不建全量统计表**。列表扫所有轮尾建 `Map`；浮条按 `data-chat-turn` 直接定位那一个轮尾。
- 扫描**提前退出**：行按文档序排列，遇到第一个还在锚带之下的行即停。
- 四个字段都没变时交回原对象，让 React 跳过重渲染。

### 刷新时机

| 触发 | 为什么 |
|---|---|
| `scroll`（document 的 **capture** 阶段） | 滚动事件不冒泡，但 capture 能收到所有后代的；这样不必先找到滚动容器，也顺带解决了「容器可能还不存在」 |
| `resize` | 换行会改变哪一行在视口里 |
| 每 1 秒 | 轮次结束时胶囊的最终值是一次 **DOM 变更而非滚动**；只靠滚动监听会让浮条永远停在流式进行中的数字上 |

浮条是 `aria-hidden` 的——它复述屏幕上已有的内容，不该被读屏重复播报。
它也不再需要任何层级处理：它是 header 的后代，本来就在 transcript 之上、弹窗之下。

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
- 视口浮条只跟踪**人类消息**（`user` / `steering` 行）——插件的整个数据模型就是这类行，
  助手回答本身不是浮条的对象。读长回答时它显示的是那条回答所属的提问。
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
