---
id: "017"
title: 抽出 TS worker viewport size 边界
kind: leaf
parent: W0
depends_on: ["016"]
discovered_from: "002"
model: gpt-5.6-terra
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts/viewport-sizes.ts
  - excel/solid-excel/test/vnext-worker-runtime-resources.test.ts
---

# 抽出 TS worker viewport size 边界

## 目标

把 row height 与 column width 元数据语义迁出 runtime 装配壳。

## 粒度

这是单一 viewport metadata 抽象：归一化、sheet rename、排序、snapshot、restore 共同维护同一份尺寸映射，不再细碎拆分。

## 上下文

保持 full-sheet bound、整数索引、正数像素校验、默认尺寸、按 sheet name 迁移、persistence wire 排序。模块只消费 `RuntimeState`，不触碰 DOM 或 Grid store。

## 覆盖矩阵行

- `C-013`：TS backend viewport metadata parity。
- `C-018`：viewport 模块职责与行数。

## 接口

### 消费

- 013 的 `RuntimeState`、`SheetEntry`。

### 产出

- `viewport-sizes.ts`：导出 snapshot/set/restore/rename 服务，供 persistence、sheet lifecycle、dispatcher 使用。

## 验收标准

1. `wc -l excel/solid-excel/src-vnext/adapter/worker-runtime-ts/viewport-sizes.ts` → 不超过 300 行。
2. `npx jest excel/solid-excel/test/vnext-worker-runtime-resources.test.ts --runInBand` → 全绿。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` → 零错误。
4. `rg -n '^function (snapshotViewportSizes|setRowHeight|setColumnWidth|restorePersistenceSizes)' excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts` → 零结果。

## 执行记录（仅编排者回写）

- 2026-08-31：依赖 016 审查通过后派发，model=`gpt-5.6-terra`，base=`723082739d66140ac697a5a9c203a6fd99649d4a`。
- 2026-08-31：执行回执按 `DONE` 处理；主文件 946→774，新模块 201 行，7 个相关测试与 tsc 通过；进入独立审查。
- 2026-08-31：独立审查 `APPROVED`；编排者复核行数与原文件单调下降证据，任务完成。
