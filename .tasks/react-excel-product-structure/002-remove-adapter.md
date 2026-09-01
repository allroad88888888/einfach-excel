---
id: "002"
title: 把现役 bridge 内部化并删除旧 adapter
kind: leaf
depends_on: ["001"]
model: gpt-5.6-sol
status: done
created: 2026-09-01
done: 2026-09-01
base: dc0897d08b496c77e60d8a96d8ea109c36ee8fb5
repair_round: 5
files:
  - excel/react-excel/src/*.ts
  - excel/react-excel/src/*.tsx
  - excel/react-excel/src/workbook/runtime/**
  - excel/react-excel/src/workbook/projection/use-workbook-viewport.ts
  - excel/react-excel/src/workbook/selection/**
  - excel/react-excel/src/workbook/editing/use-editing-session.ts
  - excel/react-excel/src/workbook/grid/SpreadsheetGrid.tsx
  - excel/react-excel/src/app/**
  - excel/react-excel/src/workbook/**
  - excel/react-excel/e2e/**
  - excel/react-excel/playwright.config.ts
  - excel/react-excel/test/**
  - excel/react-excel/package.json
  - pnpm-lock.yaml
  - excel/react-excel/README.md
  - docs/FRAMEWORK_BACKEND_E2E_MATRIX.md
  - excel/excel-site/**
  - docs/ARCHITECTURE.md
  - docs/content/article5-framework-adapters.md
  - docs/content/article5-diagrams.md
  - docs/recipes/astro.md
  - README.md
  - README.zh-CN.md
  - rules/.eslintrc
  - .tasks/react-excel-product-structure/reports/002-report.md
---

# 把现役 bridge 内部化并删除旧 adapter

## 一句话目标

让 React 产品不再依赖旧 adapter public surface。

## 实现合同

- 把当前产品实际使用的 8 个公开值迁为内部产品模块并改产品命名：
  - provider/context → `workbook/runtime/WorkbookRuntimeProvider.tsx` 与
    `workbook/runtime/use-workbook-runtime.ts`；
  - `useSpreadsheetValue` → `runtime/use-store-value.ts`；
  - selection/pointer → `selection/use-workbook-selection.ts` 与
    `selection/use-grid-pointer-selection.ts`；
  - viewport → `projection/use-workbook-viewport.ts`；
  - editing → `editing/use-editing-session.ts`；
  - grid view → `grid/SpreadsheetGrid.tsx`。
- 产品 source 全部改为相对精确 import；禁止新增内部总 barrel，也不得再 self-import
  `@einfach/react-excel`。
- 删除旧 root `src/index.ts` 与 9 个未消费 adapter surface：frozen grid、grid geometry、keyboard、
  IME、formula-bar、name-box、sheet-tabs、clipboard、history。迁移完成后 `src/` 根只允许
  `main.tsx` 和规划目录，不允许残留旧 flat adapter 文件。
- 删除 `e2e/**`、`playwright.config.ts`、对应 scripts/devDependency，并移除忽略的 e2e build artifact。
- 删除除 `test/workbook/**` 外的全部旧 adapter tests；不得留下锁 public package entry 的测试。
- `package.json` 改为私有完整应用：description 改产品语义，删除 `exports`、`sideEffects:false`、
  React peer 声明；React/ReactDOM 是 app dependencies；scripts 为 `dev`、`build`、`typecheck`、`test`。
- README 只描述完整 React Excel 产品、现有可测能力、Rust-only 边界、目标目录和启动命令；删除
  “adapter skeleton / not a complete application / supported bridge surfaces”等旧口径。
- 不复制 Solid worker/backend，不改变 UI-core 或 Rust 代码；失败仍显式报错，禁止静态 fallback。

## 验收

- `test ! -d excel/react-excel/demo` 与 `test ! -d excel/react-excel/e2e`。
- `find excel/react-excel/src -maxdepth 1 -type f` 仅为 `main.tsx`。
- `rg '@einfach/react-excel|SpreadsheetFrozenGridView|getSpreadsheetGridGeometry|useSpreadsheet(KeyboardNavigation|ImeComposition|FormulaBar|NameBox|SheetTabs|Clipboard|History)' excel/react-excel/src excel/react-excel/test` 零命中。
- package typecheck/build/test 全通过；根级 `pnpm exec tsc -b --pretty false` 通过。
- 真实 Chromium 验证 Rust/WASM ready、1000 rows、滚动选择、连续双击编辑两个单元格并回读。
- desktop/mobile 截图与 console/request failure 检查通过；UI 外观无非预期变化。
- 所有新增/大改普通文件 `wc -l` ≤300；`git diff --check` 通过。

写 `reports/002-report.md`；不提交、不改状态。

## R1

- 同步 `pnpm-lock.yaml` 的 `excel/react-excel` importer：React/ReactDOM 必须与 manifest 一致归入
  dependencies，`@playwright/test` 必须消失；用 frozen-lockfile 方式验证 manifest/lock 一致。
- 任务与 index 的 base 已由编排者纠正为真实 001 提交
  `dc0897d08b496c77e60d8a96d8ea109c36ee8fb5`。
- 发现来源：`reports/002-review.md`。

## R2

- 为临时单元格编辑 input 增加坐标派生的稳定 `id`/`name`，关闭根级 Chromium QA 的匿名表单字段告警。
- 根级浏览器复验连续编辑 B2、C2 后，两格均由 Rust 投影回读，且控制台不再出现该表单告警。
- 独立复审：`reports/002-review-v3.md`，结论 APPROVED。

## R3

- 删除旧 e2e 后，同步框架后端证据矩阵，清除提交钩子发现的两条旧 spec/CASES 死链。
- React adapter E2E 只保留明确的历史说明，不再列出已经不存在的命令，也未伪造 archive 证据。
- 独立复审：`reports/002-review-v4.md`，结论 APPROVED。

## R4

- 移除介绍站对旧 React adapter 的 island、demo route、依赖与构建配置消费，英中 React 指南改为
  独立 Rust-only Vite 产品说明。
- 首次复审发现活 lint 配置、活文档与站点负向合同仍有残留：`reports/002-review-v5.md`。

## R5

- 删除 ESLint 对已删 React island tsconfig 的引用；同步根 README、Astro recipe 与 article5 历史口径。
- AD-395 增加旧 React demo 不得回归 catalog、DemoPage、Astro integration 与 package dependency 的负向合同。
- 独立复审：`reports/002-review-v6.md`，结论 APPROVED。
