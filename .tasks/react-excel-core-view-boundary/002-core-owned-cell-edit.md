---
id: "002"
title: 单格提交只由 UI-core 编排
kind: leaf
parent: null
depends_on: ["001"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-02
done: null
base: null
files:
  - excel/spreadsheet-ui-core/src/editing/**
  - excel/spreadsheet-ui-core/src/projection/**
  - excel/spreadsheet-ui-core/src/runtime/**
  - excel/spreadsheet-ui-core/src/index.ts
  - excel/spreadsheet-ui-core/test/**editing**
  - excel/react-excel/src/workbook/editing/use-cell-edit.ts
  - excel/react-excel/test/workbook/editing/cell-editing.test.tsx
  - .tasks/react-excel-core-view-boundary/reports/002-report.md
---

# 单格提交只由 UI-core 编排

## 目标

React Cell editor 只提交编辑意图并读取提交状态；UI-core 自己取得 backend、刷新当前 projection，
并处理失败后的 refresh retry。

## 交付边界

编辑是 Rust mutation 边界，和 projection read 的风险不同：它包含 acknowledgement、刷新失败与单发保护。
本叶独立 review，不顺手接 history UI、Undo/Redo 或其它编辑入口。

## 上下文

- React 当前在 `use-cell-edit.ts` 向 `runEditingCommitAtom` 注入 `core.backend`、
  `unavailableHistoryRecorder` 和 `viewport.refresh()`。
- UI-core 已有 `runEditingCommitAtom`、`retryEditingRefreshAtom` 与完整 lifecycle 状态机。
- 001 产出的 `runVisibleProjectionAtom` 是刷新当前窗口的唯一 Rust read 入口。
- 本阶段仍保持 history unavailable，不伪造 Undo 能力；默认 recorder 由 UI-core 包装层持有，React 不再传入。

## 覆盖矩阵行

- `B-002`：单格提交成功、mutation 拒绝、refresh failure 与 retry、连续编辑两个 Cell。

## 接口

### 消费

- `runEditingCommitAtom` 与 `retryEditingRefreshAtom`：既有 acknowledged mutation 状态机。
- `runVisibleProjectionAtom`：刷新当前 visible projection。
- `spreadsheetBackendBindingAtom`：取得当前 store 已绑定的 Rust backend。

### 产出

- `runBoundEditingCommitAtom(input?: {commitSource?: EditingInputSource; move?: EditingCommitMove})`：
  React 不再传 backend、history recorder 或 refresh callback。
- `retryBoundEditingRefreshAtom`：使用 UI-core 当前 visible projection 重试刷新。

## 验收标准

1. `rg -n "core\\.backend|HistoryEntryRecorder|historyEntryRecorder|refreshProjection" excel/react-excel/src/workbook/editing/use-cell-edit.ts`
   零命中。
2. Core tests 覆盖成功、mutation reject、refresh failed/retry，且一次用户提交只发送一次 Rust mutation。
3. React editing tests 保持双击、Enter、blur、Escape、拒绝保留草稿和连续编辑通过。
4. 两包 typecheck、React test/build、范围 ESLint、cycle audit 与 `git diff --check` 通过。
5. 不新增 history UI，不把 backend 或 projection transport 重新塞回 React。

## 执行记录（仅编排者回写）

- 等 001 独立 review 与用户验收后写入 base 并派发。
