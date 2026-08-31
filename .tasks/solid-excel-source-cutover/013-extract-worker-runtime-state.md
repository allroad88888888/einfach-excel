---
id: "013"
title: 抽出 TS worker runtime 基础状态边界
kind: leaf
parent: W0
depends_on: ["001"]
discovered_from: "002"
model: gpt-5.6-terra
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts/runtime-state.ts
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts/runtime-errors.ts
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts/runtime-capabilities.ts
  - excel/solid-excel/test/vnext-worker-runtime-resources.test.ts
---

# 抽出 TS worker runtime 基础状态边界

## 目标

把 runtime state、sheet registry、fail-closed capabilities、RPC 校验基础设施迁入独立模块，使后续服务不再反向依赖装配壳。

## 粒度

这是 002 失败后迁移链的第一段，只抽所有命令族共同消费的基础契约；cell、formula、viewport、lifecycle 行为仍留给后续叶子。

## 上下文

原文件 2243 行。迁移 `SheetEntry`、`SnapshotSession`、`RuntimeState`、初始 workbook/state 构造、sheet 索引校验、RPC error/unsupported、能力常量与 sheet metadata。保持 `TS_WORKER_RUNTIME_CAPABILITIES`、`__createInitialStateForTest` 的原导出路径。正常格式，不复制第二份状态。

## 覆盖矩阵行

- `C-018`：基础状态文件职责与行数。

## 接口

### 消费

- 任务 001 的 `worker-protocol.ts` 类型 barrel。

### 产出

- `runtime-state.ts`：导出 `RuntimeState`、`SheetEntry`、`SnapshotSession`、`createInitialState`、`assertSheetIdx`、`listSheetMeta`。
- `runtime-errors.ts`：导出统一 RPC 错误与输入归一化函数。
- `runtime-capabilities.ts`：唯一拥有 `TS_WORKER_RUNTIME_CAPABILITIES` 常量，装配壳按原路径重导出。

## 验收标准

1. `wc -l excel/solid-excel/src-vnext/adapter/worker-runtime-ts/{runtime-state,runtime-errors,runtime-capabilities}.ts` → 每个文件不超过 300 行。
2. `npx jest excel/solid-excel/test/vnext-worker-runtime-resources.test.ts --runInBand` → 全绿。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` → 零错误。
4. `rg -n '^(interface (SheetEntry|SnapshotSession|RuntimeState)|function (createInitialState|assertSheetIdx|listSheetMeta))' excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts` → 零结果。

## 执行记录（仅编排者回写）

- 2026-08-31：002 粒度拆分后派发首个替代叶，model=`gpt-5.6-terra`，base=`723082739d66140ac697a5a9c203a6fd99649d4a`。
- 2026-08-31：执行回执按 `DONE` 处理；主文件 2243→2094，新增模块 20–77 行，18 个定向测试与 tsc 通过；进入独立审查。
- 2026-08-31：独立审查 `REJECTED`（R1）：`runtime-errors.ts` 混合 error wire 与输入归一化，且重复既有 `worker-wire-guards.ts`；重派删除重复 guards 并复用现有输入边界。
- 2026-08-31：R1 回执按 `DONE` 处理；errors 收口为纯 RPC 契约，normalize 改复用既有 wire guards，全部叶子验收通过；进入复审。
- 2026-08-31：R1 复审 `APPROVED`；编排者复核行数与原文件单调下降证据，任务完成。
