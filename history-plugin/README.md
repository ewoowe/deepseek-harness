# dsh-session-history

会话内消息查看器：在对话页面按组合键（默认 `Ctrl+S`）弹出**当前会话的全部消息**列表，
上下方向键选择，`Enter` 或点击跳转到该条消息在 transcript 中的位置。

这是一个**独立安装到 profile 的插件**，不修改 `deepseek-harness` 的任何源码（`packages/` 未改动）。

## 目录

```
history-plugin/
  package.json        dsh.bundle + dsh.client 声明、exports 映射
  cordis.patch.yml    层补丁（把自己登记为 Loader 条目并给配置）
  build.mjs           构建脚本（tsdown 编程接口）
  tsconfig.json       仅用于 IDE 类型解析，指向 checkout 源码（只读）
  src/
    index.ts          Node 半：Config Schema + 向页面注入配置
    shared.ts         两半共享的配置形状与解析
    client/
      index.ts        浏览器半：注册到 shell.overlay 槽位
      overlay.tsx     浮层组件、消息采集与跳转
      locales.ts      中英字典
  lib/                构建产物（index.js / client.js）
```

## 安装

```sh
node_modules/.bin/tsx history-plugin/build.mjs   # 构建（改了 src 就要重跑）
pnpm dsh plugin --profile web add ./history-plugin
```

然后**重启** `pnpm dsh web`（新增 bundle 层、以及 bundle 内容变化，都需要重启）。

卸载：

```sh
pnpm dsh plugin --profile web remove dsh-session-history
```

## 使用

| 操作 | 效果 |
|---|---|
| `Ctrl+S` | 打开／关闭消息列表 |
| `↑` `↓` | 移动高亮 |
| `Enter` | 跳转到高亮那条消息 |
| 鼠标移动 / 点击 | 移动高亮 / 跳转 |
| `Esc` | 关闭 |
| 「加载更早的消息」 | 翻入更早一页历史并重建列表 |

## 配置

编辑 `cordis.patch.yml` 的 `config:` 块，或在 profile 自己的 `cordis.patch.yml`
里按 id `session-history` 覆盖。快捷键**不是**写死在代码里的：

| 字段 | 默认 | 说明 |
|---|---|---|
| `key` | `s` | `KeyboardEvent.key` 的小写形式 |
| `ctrl` | `true` | 是否要求 Ctrl |
| `alt` | `false` | 是否要求 Alt |
| `shift` | `false` | 是否要求 Shift |
| `meta` | `false` | 是否要求 Meta（macOS Cmd / Win） |
| `maxRows` | `50` | 列表最大条数 |

macOS 想用 `Cmd+S`：`ctrl: false`、`meta: true`。

## 消息列表从哪来

第三方插件拿不到 `ui-chat` 的 node store，所以列表从**已渲染的 DOM** 采集。
这不是 hack —— 这两个属性是 `ChatView` 自己用来定位滚动锚点的契约：

- `[data-conversation-scroll]` —— 滚动容器（`ChatView` 的 `scrollerOf` 就是查它）
- `[data-chat-flow-kind="user" | "steering"]` —— 一条人类消息行
- `[data-chat-anchor-key]` —— 行标识（`ChatView` 用同一个属性做滚动位置恢复）

跳转用的也是 `ChatView` 自己的算式：
`scrollTop += row.top - scrollport.top - 24`。

代价：**只能列出已加载窗口内的消息**。窗口外的用「加载更早的消息」按钮
（走 `ISession.loadOlder()`）翻进来。

## 配置如何从 Node 半传到浏览器

启动图（boot graph）不携带 config，所以 Node 半监听 `webserver/index-inject`，
推入一行 `{ kind: 'global', name: '__DSH_SESSION_HISTORY_CONFIG__', value: config }`；
浏览器半读取该 global，缺失时回退到同一份默认值。

## 实现要点

- **浮层落点**：`shell.overlay` 槽位（ui-layout 声明，frame 级、不拦截点击）。
  组件常驻挂载、关闭时返回 `null`，这样快捷键监听一直有效。
- **键盘用捕获阶段**：composer 是 Lexical 编辑器，以 `COMMAND_PRIORITY_CRITICAL`
  注册自己的按键命令；冒泡阶段监听会被它先吃掉。
- **`Ctrl+S` 必须 `preventDefault()`**：浏览器默认是「保存网页」。
- **客户端包必须是 CJS**：产物被包进 `window.__ModuleLoader__.load({ factory: (require) => {...} })`，
  函数体内不能出现 ESM `import`。tsdown CLI 因缺 `unrun` 起不来，改用 `build()` 编程接口并传 `config: false`。
- **所有裸导入保持 external**：浏览器从模块表解析，打包进副本会导致 cordis / react 实例身份与外壳分裂。

## 已知限制

- 只列已加载窗口内的消息；更早的需点按钮翻页（每次一页）。
- 消息预览取自行内文本，长消息截断到 120 字符。
- 会话切换后列表在下一次打开时重建（打开瞬间采集）。
- 浮层用了行内样式而非 CSS Modules：独立插件拿不到仓库的 tsdown CSS 预设。
- `node_modules/@types/react` 是指向仓库 pnpm store 的软链，只为 IDE 类型服务；
  `@types/react` 升级后需重链。
- IDE 会对 `cordis.patch.yml` 误报 JSONPatch schema 错误（仓库内同名文件不报），属误报。
