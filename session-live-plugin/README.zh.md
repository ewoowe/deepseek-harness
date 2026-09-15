# dsh-session-live

[English](README.md) | 中文

> **状态：已实现（第 1–7 项）。** 插件已构建、已装入 `web` profile，作为一个 `Live` 会话视图渲染。
> 第 8 项没有写一行代码就定了：`estimate.ts` 是 `contextBreakdown` 投影已经在用的固定密度启发式，
> 且任何公开入口都取不到它，所以实时占用由图 4 的那个投影给出，而不是本插件自己再立一套计数规则。

单次会话的**实时**统计：这个会话**此刻**在做什么。

## 与「用量」的分工

`session-usage` 回答"这个会话花了多少"——**汇总**。本插件回答"它现在在干什么"——**此刻**。
两者不是同一件事的两个视图，而是两种时间视角：

| | `session-usage`（已有） | `session-live`（本插件） |
|---|---|---|
| 时间视角 | **汇总历史**：整场、或某个范围内的账 | **此刻进行中**：边跑边看 |
| 粒度 | 一轮（一个提示词及其回复） | **一步**（一次模型请求 + 它触发的工具调用） |
| 数字何时准 | 轮次**结束**后（宿主折叠对进行中的轮次 fail closed） | 进行中也要有东西可看 |
| 更新方式 | 2 秒轮询 | **事件驱动**（事件窗自带 `revision` 变更计数） |

## 实现了什么

| # | 内容 | 数据来源 | 状态 |
|---|---|---|---|
| 1 | **步级明细**：一轮展开成若干步，各自的请求与工具 | `step/start` · `step/end` | 已实现 |
| 2 | **工具调用统计**：次数、耗时、最慢的是哪个 | `tool/call` → `tool/result` 成对相减 | 已实现 |
| 3 | **耗时构成**：模型 vs 工具 vs 其它 | 投影 `sessionStats.llmMs` / `toolMs`（官方拆分） | 已实现 |
| 4 | **上下文占用**：快满了没有 | 投影 `contextPressure`（`contextWindow` / `pressureTokens` / `projectedTokens`） | 已实现 |
| 5 | **吞吐**：每轮 / 每步的 tok/s | 该轮 usage ÷ 该轮墙钟 | 已实现（官方折叠对进行中的轮次 fail closed，那一行因此显示为未知） |
| 6 | **模型与尝试轨迹**：一轮里换过几次路由 | 该轮 `usage.routes`，回退到该轮的 assistant 消息 | 已实现 |
| 7 | **实时事件流**：像 `tail -f` 那样看最近 N 个事件 | 事件窗的 `entries`，含流式 chunk | 已实现 |
| 8 | **进行中轮次的 token**（边跑边涨） | `token-meter` 的 `estimate.ts` | **未做**——并入第 4 项；见下 |

第 1–7 项**只用宿主已经发布的数据**。第 8 项不是漏掉的功能，而是一个决定，理由见下。

## 数据从哪来

**全部来自宿主已经发布的东西** ✓，`packages/` 一行不改 ✓（与另外两个插件同一约定）：

- **事件窗**（`binding.eventSource`）：`step/start`、`step/end`、`tool/call`、`tool/result`、
  `assistant/message`（含 usage 与流式 chunk）
- **投影**（`session.projections.faceOf(key)`）：`sessionStats`、`contextPressure`、
  `contextBreakdown`、`modelSelection` 等
- **每轮用量**：宿主的 `deriveTurnTokenUsage`（`@deepseek-ai/dsh-token-meter/client`）——
  与 `session-usage` 用的是同一个折叠，所以两个插件的数字不会各说一套

## 已知边界

- **进行中的轮次没有官方用量。** `turn-usage.ts` 写明是"一个**已完成** Turn 的精确记账"，且对进行中
  的轮次 fail closed。本插件不绕开这一点：进行中的轮次 `usage` 报 `null`，它的吞吐行显示为未知。
- **第 8 项读过了 `estimate.ts`，结论是"不做"。** 它按固定密度估算（4 字符 ≈ 1 token，外加每个块的
  固定框架开销），是给**请求**定价用的，不是给实时流用的；而且任何公开入口都取不到它——`token-meter`
  的 `index.ts` 只导出 `TokenMeter` 服务与类型，`client.ts` 只导出 `deriveTurnTokenUsage`。唯一的通路是
  `./src/*` 源码直通，第三方 bundle 用不了（浏览器模块表永远不会应答那个 specifier）。它真正可达的地方
  是 `contextBreakdown` 投影（它就是基于 `estimateToolsTokens` 建的），所以占用改由 `contextPressure`
  给出（第 4 项）。
- **只覆盖已加载窗口**，与 `session-usage` 同一限制、同一条补载路径（宿主自己的 jump loader，瞄向会话
  开头，自带"无进展"保护）。
- **刷新是事件驱动的，但刻意保留了一个秒级定时器。** 事件到达即刻重渲染——`SessionEventSource` 就是
  `ObservableSnapshot`，订阅入口本来就是有的。旁边那个 1 秒 tick 覆盖事件窗给不了的两件事：投影只暴露
  `getSnapshot`（没有订阅），而一个正在等模型的步骤**完全不会产生事件**，它的耗时否则会冻在屏幕上并且
  越错越多。空闲会话上一次 tick 只花一次比较，React 会直接跳过渲染。

## 命名

| 项 | 值 |
|---|---|
| npm 包名 | `dsh-session-live` |
| 目录 | `session-live-plugin/` |
| 插件 id | `session-live` |
| 视图标签 | 实时 / Live |
| locales 命名空间 | `sessionLive` |
| 存储前缀 | `dsh-session-live.` |

避开的命名：`session-trace`（撞宿主的 `trajectory` 轨迹视图）、`session-meter`（撞宿主包
`token-meter`）、`session-runtime`（与"运行时"这个技术词歧义）。

## 目录

| 文件 | 职责 |
|---|---|
| `src/index.ts` | Node 半——只有身份，没有可安装的东西 |
| `src/client/index.ts` | 注册 `conversation.view` 条目并注入读取面 |
| `src/client/live-facts.ts` | 把事件窗折叠成 轮次 → 步骤 → 工具调用，外加事件流 |
| `src/client/live-projection.ts` | 读 `contextPressure` / `sessionStats` / `tokenUsage`，以及格式化 |
| `src/client/LiveView.tsx` | 视图：上下文条、汇总、步骤列表、事件流 |

`build.mjs` 与 `tsconfig.json` 刻意照 `session-usage-plugin/`，包括它注释里论证过的两个选择：
tsconfig 不用 `paths`（把宿主 import 指到 `../packages/*/src` 会把宿主自己的类型劈成两个标称不同的
面），以及浏览器 external 用**白名单**而不是"凡裸标识符皆 external"（模块表只应答 `react` /
`react-dom`；其余任何被 externalize 的都会变成启动失败，而不是一个刚好能用的打包依赖）。

## 已知缺口

工具事件的细分类型没有逐一枚举：只折叠了 `tool/call` 与 `tool/result`，其余（`tool/bash-sample`、
`tool/client`、`tool/ptc-dispatch` 等）按"采样而非统计"跳过。若其中某个其实是应当配对的调用型事件，
步骤的工具列表就是它的归属。
