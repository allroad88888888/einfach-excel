# 013 执行报告：抽出 TS worker runtime 基础状态边界（修复第 1 轮）

## 改动摘要

- 新建 `runtime-state.ts`：唯一持有 `RuntimeState`、`SheetEntry`、`SnapshotSession`，并提供初始 workbook/state 构造、sheet 索引校验和 sheet metadata 映射。
- 新建 `runtime-errors.ts`：唯一持有 RPC request 形状、错误封装、fail-closed `UNSUPPORTED` 拒绝与错误 wire 归一化。
- 新建 `runtime-capabilities.ts`：唯一拥有冻结的 `TS_WORKER_RUNTIME_CAPABILITIES` 常量；原 `worker-runtime-ts.ts` 按原导出路径重导出该常量。
- 装配壳改为消费三个基础模块，并直接复用既有 `worker-wire-guards.ts` 的 `normalizeAddr`、`normalizeSparseRange`；保留 `__createInitialStateForTest` 原导出路径与现有 dispatch 行为；未改 files 边界外产品文件，未提交。

## 逐条验收

1. 新增模块行数：通过。`runtime-state.ts` 77 行、`runtime-errors.ts` 25 行、`runtime-capabilities.ts` 20 行，均不超过 300 行。
2. `npx jest excel/solid-excel/test/vnext-worker-runtime-resources.test.ts --runInBand`：通过，1/1 suite、2/2 tests 全绿。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false`：通过，零错误。
4. `rg -n '^(interface (SheetEntry|SnapshotSession|RuntimeState)|function (createInitialState|assertSheetIdx|listSheetMeta))' excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts`：通过，零结果。
5. 补充行为证据：`npx jest excel/solid-excel/test/vnext-worker-ts-failclosed.test.ts --runInBand` 通过，1/1 suite、16/16 tests；证明原导出路径的 capabilities handshake 与 UNSUPPORTED 拒绝语义保持不变。
6. `git diff --check`（任务产品文件）及新增模块的 no-index 检查：通过，无空白错误。

## C-018 证据

| 文件 | 一句话职责 | 物理行数 |
|---|---|---:|
| `worker-runtime-ts/runtime-state.ts` | 建立 workbook、sheet registry 与会话的运行时状态。 | 77 |
| `worker-runtime-ts/runtime-errors.ts` | 定义 worker RPC 的 request 与 error 契约。 | 25 |
| `worker-runtime-ts/runtime-capabilities.ts` | 声明 TS worker 的 fail-closed 能力。 | 20 |
| `worker-runtime-ts.ts` | 作为连续迁移中的临时运行时装配壳。 | 2093 |

三个新增基础模块均符合普通文件 300 行硬上限。原壳尚处 013–019 串行迁移的已记账中间态，未机械压行；后续叶子将继续按 cell projection、data transfer、custom formulas、viewport、sheet lifecycle、dispatch 的职责边界降低其行数。

## 原文件行数变化

`excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts`：2243 → 2093 行，减少 150 行。

## 未验证项、发现与疑虑

- 未验证：未运行全仓 Jest、浏览器 E2E 或打包流程；它们不是本叶验收命令。
- 发现：共享工作树已有其他并行任务的未提交改动；本叶未触碰其产品文件。
- 疑虑：原装配壳仍为 2093 行，超过通常上限；这是任务链显式允许的临时债务，019 前仍须保持单调下降并最终收口至 300 行内。
- 修复第 1 轮：已移除 `runtime-errors.ts` 中与 RPC error 无关的两个 normalize 实现，避免与既有 `worker-wire-guards.ts` 重复；该文件现在可用一句话表述为“定义 worker RPC 的 request 与 error 契约”。

## 最终四态

- 实现：完成——基础 state、error 和 capabilities 均已实际抽出，输入归一化复用既有 wire guard。
- 验收：通过——指定 Jest、TypeScript、定位扫描与行数检查均通过。
- 范围：完成——产品改动仅落在任务 files，报告仅写本任务报告路径。
- 未验证：保留——全仓 Jest/E2E/打包不属于本叶指定验收。
