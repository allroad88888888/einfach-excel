---
id: "019"
title: 收口 TS worker 命令分派壳
kind: leaf
parent: W0
depends_on: ["018"]
discovered_from: "002"
model: gpt-5.6-sol
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts/command-*.ts
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts/runtime-dispatch.ts
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts/sheet-lifecycle.ts
  - excel/solid-excel/test/vnext-worker-ts-failclosed.test.ts
  - excel/solid-excel/test/vnext-worker-undo-ts.test.ts
  - excel/solid-excel/test/vnext-worker-runtime-resources.test.ts
  - excel/solid-excel/test/vnext-top-bottom-projection.test.ts
---

# 收口 TS worker 命令分派壳

## 目标

把 inline switch 收口为 command-family handler 链，使公开 runtime 文件只负责装配、安装、串行化。

## 粒度

这是 013–019 迁移链的最终原子门：前置服务已建立显式边界，本叶只按内聚命令族路由并关闭原文件超限状态。

## 上下文

保持每个 command 字符串、payload、返回值、UNSUPPORTED、unknown command、mutating command 串行队列、async pump idle、worker postMessage 错误 wire 不变。handler 接收显式 state/service context，不持第二份状态；禁止一个 case 一个文件或大杂烩 handler。

## 覆盖矩阵行

- `C-013`：TS backend 最终命令面。
- `C-018`：原 2243 行文件最终关闭。

## 接口

### 消费

- 013–018 的全部显式 services。

### 产出

- `runtime-dispatch.ts` 与少量 `command-<family>.ts`：命令族路由。
- `worker-runtime-ts.ts`：只导出 `TS_WORKER_RUNTIME_CAPABILITIES`、`WorkerContext`、`ExcelCoreTsWorkerRuntime`、`createWorkerRuntimeTs`、`installWorkerRuntimeTs`、`__createInitialStateForTest`。

## 验收标准

1. `find excel/solid-excel/src-vnext/adapter/worker-runtime-ts -type f -print0 | xargs -0 wc -l && wc -l excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts` → 所有普通文件与公开装配壳均不超过 300 行。
2. `npx jest excel/solid-excel/test/vnext-worker-ts-failclosed.test.ts excel/solid-excel/test/vnext-worker-undo-ts.test.ts excel/solid-excel/test/vnext-worker-runtime-resources.test.ts excel/solid-excel/test/vnext-top-bottom-projection.test.ts --runInBand` → 全绿。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` → 零错误。
4. `git diff --check` → 零错误。

## 执行记录（仅编排者回写）

- 2026-08-31：依赖 018 审查通过后派发最终收口，model=`gpt-5.6-sol`，base=`723082739d66140ac697a5a9c203a6fd99649d4a`。
- 2026-08-31：执行回执按 `DONE` 处理；公开壳 662→125，目录 19 个模块全部 ≤300，35 个定向测试与 tsc 通过；进入独立审查。
- 2026-08-31：独立审查 `REJECTED`（R1）：transfer handler 反向导入 workbook handler 的 restore service，context 隐式依赖；扩大本叶到 lifecycle service，重派做显式注入并删除无用 dirty 类型。
- 2026-08-31：R1 回执按 `DONE` 处理；restore 纳入 lifecycle service，lifecycle/persistence 由公开壳通过 context 显式注入，删除无用类型，全部验收通过；进入复审。
- 2026-08-31：R1 复审 `APPROVED`；编排者复核公开壳 172 行、最大子模块 284 行与 command-family 无反向 import，任务完成。
