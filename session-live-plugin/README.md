# dsh-session-live

English | [中文](README.zh.md)

> **Status: implemented (items 1–7).** The plugin is built, installed into the `web` profile, and
> renders as a `Live` conversation view. Item 8 was settled without code: `estimate.ts` is the
> fixed-density heuristic the `contextBreakdown` projection is already built on, and it is not
> reachable from any public entry point, so the live occupancy figure comes from that projection
> (item 4) rather than from a second counting rule of this plugin's own.

Live statistics for a single session: what the conversation is doing **right now**.

## How it differs from "Usage"

`session-usage` answers "how much has this session spent" — a **summary**. This one answers
"what is it doing" — **the present moment**. They are two views in time, not two views of one
thing:

| | `session-usage` (existing) | `session-live` (this one) |
|---|---|---|
| Time | **Summary**: the whole session, or a chosen range | **The present**: watch it run |
| Granularity | a turn (one prompt and its reply) | a **step** (one model request and the tool calls it triggers) |
| When the figures are exact | after the turn **ends** (the host's fold fails closed on a running one) | there has to be something to read while it runs |
| Refresh | a 2-second poll | **event-driven** (the window carries its own `revision` counter) |

## What it implements

| # | Content | Source | Status |
|---|---|---|---|
| 1 | **Step detail**: a turn expanded into its steps, each with its request and tools | `step/start` · `step/end` | shipped |
| 2 | **Tool statistics**: calls, duration, which one is slowest | paired `tool/call` → `tool/result` | shipped |
| 3 | **Where the time went**: model vs tools vs the rest | projections `sessionStats.llmMs` / `toolMs` (the host's own split) | shipped |
| 4 | **Context occupancy**: how full it is | projection `contextPressure` (`contextWindow` / `pressureTokens` / `projectedTokens`) | shipped |
| 5 | **Throughput**: tokens/s per turn and per step | that turn's usage ÷ its wall time | shipped (the fold fails closed on a running turn, so that row reads as unknown) |
| 6 | **Model and attempt trail**: how many routes one turn went through | that turn's `usage.routes`, falling back to its assistant messages | shipped |
| 7 | **Live event stream**: `tail -f` over the last N events | the window's `entries`, transient chunks included | shipped |
| 8 | **A running turn's tokens** (growing as it streams) | `token-meter`'s `estimate.ts` | **not built** — folded into item 4; see below |

Items 1–7 read only what the host already publishes. Item 8 is not a missing feature but a
decision, and the reasoning is below.

## Where the data comes from

**Everything comes from what the host already publishes** ✓, with `packages/` untouched ✓ —
the same rule the other two plugins follow:

- **The event window** (`binding.eventSource`): `step/start`, `step/end`, `tool/call`,
  `tool/result`, `assistant/message` (usage and streaming chunks included)
- **Projections** (`session.projections.faceOf(key)`): `sessionStats`, `contextPressure`,
  `contextBreakdown`, `modelSelection`, …
- **Per-turn usage**: the host's own `deriveTurnTokenUsage`
  (`@deepseek-ai/dsh-token-meter/client`) — the same fold `session-usage` uses, so the two
  plugins cannot print two different numbers for one turn

## Known limits

- **A running turn has no official usage.** `turn-usage.ts` states it accounts for "every attempt
  in one **completed** Turn" and fails closed otherwise. This plugin does not work around that:
  a turn in flight reports `usage: null` and its throughput row reads as unknown.
- **Item 8 was resolved by reading `estimate.ts`, and the answer is "do not build it".** It is a
  fixed-density heuristic (4 characters ≈ 1 token, plus fixed per-block framing) used for
  pricing a REQUEST, not a live stream — and it is exported from no public entry point:
  `token-meter`'s `index.ts` exposes only the `TokenMeter` service and types, and its `client.ts`
  exposes only `deriveTurnTokenUsage`. The one way in is the `./src/*` source passthrough, which
  a third-party bundle cannot use (the browser module table would never answer that specifier).
  What the heuristic IS reachable through is the `contextBreakdown` projection, which is built on
  `estimateToolsTokens` — so occupancy is reported from `contextPressure` (item 4) instead.
- **Only the loaded window is covered**, the same limit as `session-usage` and the same way out of
  it (the host's own jump loader, aimed at the session's beginning, with its no-progress guard).
- **Refresh is event-driven, with one deliberate second timer.** An arriving event re-renders the
  pane immediately — `SessionEventSource` is an `ObservableSnapshot`, so `subscribe` was there
  after all. The one-second tick beside it covers the two facts the window cannot deliver: the
  projections expose only `getSnapshot` (no subscribe), and a step waiting on a model emits no
  events at all, so its elapsed time would otherwise freeze on screen while being wrong by a
  growing amount. A tick over an idle session costs one comparison and React bails out.

## Naming

| | |
|---|---|
| npm package | `dsh-session-live` |
| directory | `session-live-plugin/` |
| plugin id | `session-live` |
| view tab | 实时 / Live |
| locales namespace | `sessionLive` |
| storage prefix | `dsh-session-live.` |

Names deliberately avoided: `session-trace` (collides with the host's `trajectory` view),
`session-meter` (collides with the host package `token-meter`), `session-runtime` (ambiguous
with the ordinary technical sense of "runtime").

## Layout

| File | Role |
|---|---|
| `src/index.ts` | Node half — identity only; nothing to install |
| `src/client/index.ts` | Registers the `conversation.view` entry and injects the read face |
| `src/client/live-facts.ts` | Folds the event window into turns → steps → tool calls, plus the stream |
| `src/client/live-projection.ts` | Reads `contextPressure` / `sessionStats` / `tokenUsage`, and the formatters |
| `src/client/LiveView.tsx` | The view: context bar, totals, step list, event stream |

`build.mjs` and `tsconfig.json` follow `session-usage-plugin/` deliberately, including the two
choices its comments argue for: no `paths` in the tsconfig (routing host imports at
`../packages/*/src` splits the host's own types across two nominally different planes), and a
browser-externals WHITELIST rather than "everything bare" (the module table answers only
`react` / `react-dom`; anything else externalised becomes a boot failure instead of a bundled
dependency that simply works).

## Known gaps

Tool event subtypes are not enumerated: only `tool/call` and `tool/result` are folded, and the
others (`tool/bash-sample`, `tool/client`, `tool/ptc-dispatch`, …) are skipped as sampling rather
than statistics. If one of them turns out to be a call-shaped event this fold should pair, the
step's tool list is where it belongs.
