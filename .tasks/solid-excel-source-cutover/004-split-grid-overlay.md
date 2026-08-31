---
id: "004"
title: 重建 Grid overlay 渲染边界
kind: leaf
parent: W0
depends_on: []
discovered_from: null
model: gpt-5.6-terra
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/solid-excel/src-vnext/grid/SpreadsheetGridOverlay.tsx
  - excel/solid-excel/src-vnext/grid/SpreadsheetGridOverlaySvg.tsx
  - excel/solid-excel/src-vnext/grid/overlay-*.ts
  - excel/solid-excel/src-vnext/grid/overlay-*.tsx
  - excel/solid-excel/test/vnext-grid-overlay.test.tsx
  - excel/solid-excel/test/vnext-grid-overlay-svg.test.tsx
---

# 重建 Grid overlay 渲染边界

## 目标

分离 canvas renderer、Solid 挂载生命周期、SVG geometry memo 与 SVG 图层渲染，使两个现有超限组件降到职责上限内。

## 粒度

canvas renderer 与 SVG renderer 是两种机制；每种内部再只按“状态/几何”和“绘制”边界拆，不把每个图形拆成微文件。

## 上下文

保持所有颜色、边框宽度、marching ants 帧调度、freeze/merge/selection/formula-reference/conditional-format 图层顺序和 testid 不变。

## 覆盖矩阵行

- `C-013`：现役 Grid 可视层。
- `C-018`：现役文件行数。

## 接口

### 消费

- 现有 `OverlayViewportProvider`、`OverlayContextFactory` 与 UI-core overlay atoms。

### 产出

- `SpreadsheetGridOverlay`、`SpreadsheetGridOverlaySvg` 与 `OverlayRenderer` 继续从原 grid 边界可导入。
- geometry/draw 模块只接收普通数据，不创建第二个 store。

## 验收标准

1. `wc -l excel/solid-excel/src-vnext/grid/SpreadsheetGridOverlay.tsx excel/solid-excel/src-vnext/grid/SpreadsheetGridOverlaySvg.tsx excel/solid-excel/src-vnext/grid/overlay-*` → 普通文件均不超过 300 行。
2. `npx jest excel/solid-excel/test/vnext-grid-overlay.test.tsx excel/solid-excel/test/vnext-grid-overlay-svg.test.tsx --runInBand` → 全绿。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` → 零错误。

## 执行记录（仅编排者回写）

- 2026-08-31：派发执行，model=`gpt-5.6-terra`，base=`723082739d66140ac697a5a9c203a6fd99649d4a`。
- 2026-08-31：执行回执 `DONE_WITH_CONCERNS`；36 个定向测试通过，行数通过，全量 tsc 被并行任务 001 的未闭合文件中间态阻断；进入独立审查。
- 2026-08-31：独立审查 `REJECTED`（R1）：SVG 未形成 geometry/state 与 layers 边界，Canvas/SVG 多处用超长单行机械压缩行数；重派原执行 agent 修复。
- 2026-08-31：R1 回执 `DONE`；新增 SVG geometry/layers 边界，恢复正常格式后各文件 77–271 行，36 个测试与全量 tsc 通过；进入复审。
- 2026-08-31：R1 复审 `APPROVED`；编排者复核格式化后行数验收（最大 271 行），无新增质量发现；任务完成。
