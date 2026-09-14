# dsh-session-live

[English](README.md) | 中文

> **状态：规划中，尚未实现。** 本目录目前只有这份说明——没有源码、没有 `package.json`、
> 没有构建脚本。下面写的是**准备做什么**与**能做到什么程度**，不是已完成的事实。

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

## 准备实现什么

| # | 内容 | 数据来源 | 状态 |
|---|---|---|---|
| 1 | **步级明细**：一轮展开成若干步，各自的请求与工具 | `step/start` · `step/end` | 现成数据 ✓ |
| 2 | **工具调用统计**：次数、耗时、最慢的是哪个 | `tool/call` → `tool/result` 成对相减 | 现成数据 ✓ |
| 3 | **耗时构成**：模型 vs 工具 vs 其它 | 投影 `sessionStats.llmMs` / `toolMs`（官方拆分） | 现成数据 ✓ |
| 4 | **上下文占用**：快满了没有 | 投影 `contextPressure` / `contextBreakdown` | 现成数据 ✓ |
| 5 | **吞吐**：每轮 / 每步的 tok/s | 该轮 usage ÷ 该轮墙钟 | 现成数据 ✓ |
| 6 | **模型与尝试轨迹**：一轮里换过几次路由 | 该轮 `usage.routes`（含每次尝试） | 现成数据 ✓ |
| 7 | **实时事件流**：像 `tail -f` 那样看最近 N 个事件 | 事件窗的 `entries` | 现成数据 ✓ |
| 8 | **进行中轮次的 token**（边跑边涨） | `token-meter` 的 `estimate.ts`——**待确认** | 见下 |

前七项**只用宿主已经发布的数据**，第八项要先确认官方有没有估算口径。

## 数据从哪来

**全部来自宿主已经发布的东西** ✓，`packages/` 一行不改 ✓（与另外两个插件同一约定）：

- **事件窗**（`binding.eventSource`）：`step/start`、`step/end`、`tool/call`、`tool/result`、
  `assistant/message`（含 usage 与流式 chunk）
- **投影**（`session.projections.faceOf(key)`）：`sessionStats`、`contextPressure`、
  `contextBreakdown`、`modelSelection` 等
- **每轮用量**：宿主的 `deriveTurnTokenUsage`（`@deepseek-ai/dsh-token-meter/client`）——
  与 `session-usage` 用的是同一个折叠，所以两个插件的数字不会各说一套

## 已知边界

- **进行中的轮次没有官方用量。** `token-meter/turn-usage.ts` 写明是"一个**已完成** Turn 的精确
  记账"，且对进行中的轮次 fail closed——这正是 `session-usage` 表格里那一行显示「—」的原因。
- **`estimate.ts` 尚未读过。** 它是 `token-meter` 里的"估算"。若它正是官方为进行中轮次准备的
  口径，实时数字就由它提供；**若读下来发现它不适用于此，这一项就不做**——绝不为"实时"自己造第二套
  口径，那正是本仓库反复吃过的亏。
- **工具事件的细分类型未逐一确认**：已知 `tool/call`、`tool/result`，另有 `tool/bash-sample`、
  `tool/client`、`tool/ptc-dispatch` 等；哪些属于统计、哪些属于流式采样，实现时再逐个定。
- **只覆盖已加载窗口**，与 `session-usage` 同一限制、同一条补载路径（逐页往前拉，覆盖即停，
  载入不回缩）。
- **事件驱动更新需要确认订阅入口**：窗口有 `revision` 变更计数（`turn-facts.ts` 已用它判断
  "窗口动没动"），但"订阅"的读口还没查。

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

## 下一步

1. 照 `session-usage-plugin/` 的模板建 `package.json`、`build.mjs`、`tsconfig.json`、
   `cordis.patch.yml`，让插件能被 profile 装载
2. 先做**第 1–4 项**（全是现成数据，风险最低）：步级明细、工具统计、耗时构成、上下文占用
3. 再读 `estimate.ts`，决定第 8 项做不做
4. 最后做第 7 项事件流
5. 每完成一步提交一次，README 随实现推进更新（**这份文档里的"状态"列必须跟着改**）
