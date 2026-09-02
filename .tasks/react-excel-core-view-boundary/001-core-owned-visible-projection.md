---
id: "001"
title: 连续投影只由 UI-core 调用 Rust
kind: leaf
parent: null
depends_on: []
discovered_from: null
model: gpt-5.6-sol
status: running
created: 2026-09-02
done: null
base: 6f07cae2568596331a2be333791203694d59bc17
files:
  - excel/spreadsheet-ui-core/src/createSpreadsheetUi.ts
  - excel/spreadsheet-ui-core/src/index.ts
  - excel/spreadsheet-ui-core/src/runtime/backend-state.ts
  - excel/spreadsheet-ui-core/src/projection/run-visible-projection.ts
  - excel/spreadsheet-ui-core/test/run-visible-projection.test.ts
  - excel/react-excel/src/workbook/projection/use-workbook-viewport.ts
  - excel/react-excel/test/workbook/projection/projection.test.tsx
  - excel/react-excel/test/workbook/editing/cell-editing.test.tsx
  - .tasks/react-excel-core-view-boundary/reports/001-report.md
---

# 连续投影只由 UI-core 调用 Rust

## 目标

React 只提交可见窗口并订阅 projection snapshot；UI-core 独立完成 Rust read、最新窗口排队、
resolve/reject、失败发布和过期请求判定。

## 交付边界

可见投影是所有 Cell 渲染的读边界，单独 review 可以在不混入 editing mutation 的情况下验证并发窗口
和失败语义。该叶完成后，React projection hook 不再拥有 transport Promise 或直接读取 backend。

## 上下文

- 当前实现基线的 projection 状态机位于 `spreadsheet-ui-core/src/projection/index.ts`。
- React 旧实现位于 `react-excel/src/workbook/projection/use-workbook-viewport.ts`，此前直接调用
  `readVisibleProjection`，并自行写 `begin/resolve/rejectProjectionAtom`。
- 当前 worktree 已新增 `runVisibleProjectionAtom` 和 store-local backend binding，但尚未独立 review。
- Einfach 在开发环境会冻结 source atom 值；backend 必须放在浅冻结包装对象中，不能直接作为 atom 值。
- Einfach async setter 不得以 rejected Promise 表达业务结果；command 返回
  `ready | superseded | failed` 的显式 outcome。

## 覆盖矩阵行

- `B-001`：首屏投影、连续滚动最新窗口、Rust terminal failure。

## 接口

### 消费

- `beginProjectionAtom`、`resolveProjectionAtom`、`rejectProjectionAtom`：复用既有 projection 状态机。
- `SpreadsheetBackend.readVisibleProjection(request)`：从 store-local backend binding 内部调用。

### 产出

- `runVisibleProjectionAtom(input: RunVisibleProjectionInput): Promise<RunVisibleProjectionOutcome>`：
  供 React 及后续框架视图提交可见窗口。
- `RunVisibleProjectionOutcome` 精确为 `{status:'ready'} | {status:'superseded'} |
  {status:'failed'; error:string}`。

## 验收标准

1. `rg -n "readVisibleProjection|beginProjectionAtom|resolveProjectionAtom|rejectProjectionAtom|core\\.backend" excel/react-excel/src/workbook/projection/use-workbook-viewport.ts`
   零命中。
2. Core tests 证明正常投影、最新窗口替换、terminal failure，并证明 backend 对象没有被 atom 冻结。
3. `pnpm --filter @einfach/react-excel test`、typecheck、生产 build 全通过。
4. `pnpm --filter @einfach/spreadsheet-ui-core build`、范围 ESLint、`pnpm check:cycles`、
   `git diff --check` 全通过。
5. 所有新增或大改普通文件 `wc -l ≤300`。

## 执行记录（仅编排者回写）

- 2026-09-02：导入当前未提交实现；本地 15 tests、两包 typecheck/build、ESLint、cycle audit 和
  diff check 已通过。因尚无独立 report/review，状态保持 `running`。
