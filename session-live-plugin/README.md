# dsh-session-live

English | [中文](README.zh.md)

> **Status: planned, not implemented.** This directory currently holds this document only —
> no source, no `package.json`, no build script. What follows is what this plugin is *going*
> to do and how far it can honestly go, not what it does.

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

## What it will implement

| # | Content | Source | Status |
|---|---|---|---|
| 1 | **Step detail**: a turn expanded into its steps, each with its request and tools | `step/start` · `step/end` | data on hand ✓ |
| 2 | **Tool statistics**: calls, duration, which one is slowest | paired `tool/call` → `tool/result` | data on hand ✓ |
| 3 | **Where the time went**: model vs tools vs the rest | projections `sessionStats.llmMs` / `toolMs` (the host's own split) | data on hand ✓ |
| 4 | **Context occupancy**: how full it is | projections `contextPressure` / `contextBreakdown` | data on hand ✓ |
| 5 | **Throughput**: tokens/s per turn and per step | that turn's usage ÷ its wall time | data on hand ✓ |
| 6 | **Model and attempt trail**: how many routes one turn went through | that turn's `usage.routes` | data on hand ✓ |
| 7 | **Live event stream**: `tail -f` over the last N events | the window's `entries` | data on hand ✓ |
| 8 | **A running turn's tokens** (growing as it streams) | `token-meter`'s `estimate.ts` — **unconfirmed** | see below |

The first seven read only what the host already publishes. The eighth depends on whether an
official estimate exists.

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

- **A running turn has no official usage.** `token-meter/turn-usage.ts` states it accounts for
  "every attempt in one **completed** Turn" and fails closed otherwise — which is exactly why
  the usage table shows a dash for the turn in flight.
- **`estimate.ts` has not been read yet.** It is the "estimate" in `token-meter`. If it turns
  out to be the official answer for a running turn, it supplies the live figure; **if it does
  not fit this use, that row will not be built** — inventing a second counting rule is the one
  mistake this repository keeps rediscovering.
- **The tool event subtypes are not all confirmed**: `tool/call` and `tool/result` are known,
  and `tool/bash-sample`, `tool/client`, `tool/ptc-dispatch` and others exist; which are
  statistics and which are sampling gets settled during implementation.
- **Only the loaded window is covered**, the same limit as `session-usage` and the same way out
  of it (pages pulled backwards, stopping once covered, and the load never shrinks back).
- **Event-driven refresh needs a subscription entry point confirmed**: the window has a
  `revision` counter (`turn-facts.ts` already compares it), but the subscribe side is not yet
  located.

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

## Next steps

1. Copy the shape of `session-usage-plugin/` for `package.json`, `build.mjs`, `tsconfig.json`
   and `cordis.patch.yml`, so the profile can mount it
2. Build rows **1–4** first — all of them read data already on hand
3. Read `estimate.ts` and decide on row 8
4. Build row 7, the event stream, last
5. Commit per step, and keep this document's **Status** column true as the code lands
