---
id: "002"
title: 将 TS worker runtime 按命令族拆成可独立维护的模块
kind: leaf
parent: W0
depends_on: ["001"]
discovered_from: null
model: gpt-5.6-sol
status: failed
created: 2026-08-31
done: null
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts/**
  - excel/solid-excel/test/vnext-worker-ts-failclosed.test.ts
  - excel/solid-excel/test/vnext-worker-undo-ts.test.ts
  - excel/solid-excel/test/vnext-worker-runtime-resources.test.ts
  - excel/solid-excel/test/vnext-top-bottom-projection.test.ts
---

# 将 TS worker runtime 按命令族拆成可独立维护的模块

## 目标

把 2243 行 TS runtime 拆为 runtime state、cell/range、import/export、custom formula、viewport size、command dispatch 模块，保留 `createWorkerRuntimeTs` 与 `installWorkerRuntimeTs` 行为。

## 粒度

runtime 是单一状态机，但已包含六个可独立变化的命令族；按命令族拆能让一次功能修改通常只落一个文件，不按行数机械切片。

## 上下文

`worker-runtime-ts.ts` 是 `@einfach/excel-core-ts` 的 worker 适配层，不得改变其 fail-closed capability 声明、RPC 错误码、mutating command 串行语义或测试专用 `__createInitialStateForTest`。

## 覆盖矩阵行

- `C-013`：TS 后端 parity。
- `C-018`：现役文件行数。

## 接口

### 消费

- 任务 001 产出的 wire schema/barrel。

### 产出

- `worker-runtime-ts.ts`：只装配并导出既有公共符号。
- `worker-runtime-ts/runtime-state.ts`：唯一拥有 `RuntimeState` 初始化与 sheet registry。
- 命令族模块：通过显式 handler 接口消费 state，不各自持第二份状态。

## 验收标准

1. `find excel/solid-excel/src-vnext/adapter/worker-runtime-ts -type f -print0 | xargs -0 wc -l` → 每个普通文件不超过 300 行。
2. `npx jest excel/solid-excel/test/vnext-worker-ts-failclosed.test.ts excel/solid-excel/test/vnext-worker-undo-ts.test.ts excel/solid-excel/test/vnext-worker-runtime-resources.test.ts excel/solid-excel/test/vnext-top-bottom-projection.test.ts --runInBand` → 全绿。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` → 零错误。

## 执行记录（仅编排者回写）

- 2026-08-31：依赖 001 审查通过后派发执行，model=`gpt-5.6-sol`，base=`723082739d66140ac697a5a9c203a6fd99649d4a`。
- 2026-08-31：首次回执 `NEEDS_CONTEXT`，未改产品文件；原因是误把单轮时间窗视为任务截止。编排者补充可跨轮持续执行上下文，以同模型、同范围重派。
- 2026-08-31：同一执行者再次回执 `BLOCKED`，确认不缺接口上下文且仍未改产品文件。裁决：不拆成会留下 >500 行中间态的机械叶子，换新 `gpt-5.6-sol` 执行者完整接管。
- 2026-08-31：新执行者仍回执 `BLOCKED` 且未改产品文件。原粒度裁决撤销：本叶标记 `failed`，由 `discovered_from: 002` 的 013–019 按真实职责串行替代；006 改依赖 019。
