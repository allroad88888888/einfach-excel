---
id: "014"
title: 抽出 TS worker cell projection 边界
kind: leaf
parent: W0
depends_on: ["013"]
discovered_from: "002"
model: gpt-5.6-sol
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts/cell-values.ts
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts/range-projection.ts
  - excel/solid-excel/test/vnext-worker-undo-ts.test.ts
  - excel/solid-excel/test/vnext-top-bottom-projection.test.ts
---

# 抽出 TS worker cell projection 边界

## 目标

把 cell value 读写语义与稀疏 range projection 迁出 runtime 装配壳。

## 粒度

cell scalar/spill 投影与 range 遍历共享同一套读取契约，作为一个交付点拆成两个互相单向依赖的模块；import session、公式注册不在本叶。

## 上下文

保持数组锚点折叠、spill lookback、错误显示词汇、文本 `=A1` 不误判公式、SparseCell 序列化词汇、range clamp/clear/snapshot/read 行为逐字一致。禁止复制 `RuntimeState` 或 workbook store。

## 覆盖矩阵行

- `C-013`：TS backend cell projection parity。
- `C-018`：cell/range 文件职责与行数。

## 接口

### 消费

- 013 的 `RuntimeState`、`SheetEntry`、`assertSheetIdx`。

### 产出

- `cell-values.ts`：唯一拥有 value/display/spill/cell snapshot 与单 cell 写入语义。
- `range-projection.ts`：唯一拥有 range 归一化、稀疏收集、snapshot/read/clear 语义。

## 验收标准

1. `wc -l excel/solid-excel/src-vnext/adapter/worker-runtime-ts/{cell-values,range-projection}.ts` → 正常格式下每个文件不超过 300 行。
2. `npx jest excel/solid-excel/test/vnext-worker-undo-ts.test.ts excel/solid-excel/test/vnext-top-bottom-projection.test.ts --runInBand` → 全绿。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` → 零错误。
4. `rg -n '^function (readCellValue|readCellSnapshot|readSparseCell|snapshotRangeSparse|readSparseRange|clearRange)' excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts` → 零结果。

## 执行记录（仅编排者回写）

- 2026-08-31：依赖 013 复审通过后派发，model=`gpt-5.6-sol`，base=`723082739d66140ac697a5a9c203a6fd99649d4a`。
- 2026-08-31：执行回执 `DONE`；主文件 2093→1501，新模块 295/115 行，17 个定向测试与 tsc 通过；进入独立审查。
- 2026-08-31：独立审查 `REJECTED`（R1）：通用 range 稀疏枚举仍由 `cell-values.ts` 导出；重派把 bounds 收集归入 range-projection，并把 spill 候选收口为 cell 内部实现。
- 2026-08-31：R1 回执 `DONE`；通用 bounds 收集归入 range-projection，cell-values 仅保留私有 spill 候选扫描，全部验收通过；进入复审。
- 2026-08-31：R1 复审 `APPROVED`；编排者复核新模块 284/149 行与通用 helper 无外泄，任务完成。
