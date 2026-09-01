---
id: "001"
title: 把临时 demo 升成完整产品目录
kind: leaf
depends_on: []
model: gpt-5.6-sol
status: done
created: 2026-09-01
done: 2026-09-01
base: 1b842837fae6a90b029846a6e5298640d429f223
repair_round: 2
files:
  - excel/react-excel/demo/**
  - excel/react-excel/index.html
  - excel/react-excel/vite.config.ts
  - excel/react-excel/tsconfig.json
  - excel/react-excel/package.json
  - excel/react-excel/src/app/**
  - excel/react-excel/src/main.tsx
  - excel/react-excel/src/workbook/backend/**
  - excel/react-excel/src/workbook/chrome/**
  - excel/react-excel/src/workbook/data/**
  - excel/react-excel/src/workbook/editing/use-cell-edit.ts
  - excel/react-excel/src/workbook/grid/CellEditor.tsx
  - excel/react-excel/src/workbook/grid/WorkbookGrid.tsx
  - excel/react-excel/src/workbook/grid/*.css
  - excel/react-excel/src/workbook/projection/use-grid-window.ts
  - excel/react-excel/src/workbook/Workbook.tsx
  - excel/react-excel/src/workbook/workbook.css
  - excel/react-excel/test/workbook/**
  - .tasks/react-excel-product-structure/reports/001-report.md
---

# 把临时 demo 升成完整产品目录

## 一句话目标

让包根 Vite 入口加载按业务域组织的 React Excel 产品。

## 实现合同

- `demo/index.html`、`demo/vite.config.ts` 升到 `react-excel/` 根；Vite 不再设置 `root: 'demo'`，
  build 输出仍是 `dist`，dev/preview 仍使用 `127.0.0.1:5183`。
- 根 `tsconfig.json` 改为完整 app 配置：`jsx: react-jsx`、Bundler resolution、`noEmit`、
  `vite/client`，include 新 `src/**`。不保留旧 declaration-only adapter 构建语义。
- `demo/main.tsx` → `src/main.tsx`；`demo/App.tsx` → `src/app/App.tsx`。
- 业务文件按 index 的目标目录迁移并改成产品命名：
  - `RustWorksheet` → `workbook/Workbook`；
  - `DemoGrid` → `workbook/grid/WorkbookGrid`；
  - `DemoCellEditor` → `workbook/grid/CellEditor`；
  - `useDemoCellEdit` → `workbook/editing/use-cell-edit`；
  - `useDemoGridWindow` → `workbook/projection/use-grid-window`；
  - Rust backend/seed → `workbook/backend/`；列定义 → `workbook/data/sales-orders.ts`；
  - header/ribbon/formula/footer → `workbook/chrome/`。
- 禁止 barrel；所有产品 import 使用相对的精确模块路径。001 可继续临时消费尚未删除的
  `@einfach/react-excel` 旧 bridge，002 会消除该边界。
- CSS 按职责落位：全局 token/reset 在 `app/app.css`；工作簿框架在 `workbook/workbook.css`；
  grid layout/viewport 合并为 `grid/grid.css`；cell editor 独立；四个 chrome surface 各自 CSS。
  旧 `worksheet.css` 中 footer 规则必须归 `chrome/footer.css`，不能整体换名搬运。
- 三个现役测试迁入 `test/workbook/` 并使用产品名：Rust backend、projection、cell editing。
  其它旧 adapter tests 本叶不动，002 删除。
- 本叶不改 UI 外观、不增加功能、不删除旧 adapter/e2e。

## 验收

- `excel/react-excel/demo` 不存在，根 `index.html` 可定位 `src/main.tsx`。
- `pnpm --filter @einfach/react-excel typecheck`、`build` 通过；package scripts 不再含 `demo` config。
- 三个迁移后的产品测试通过；Rust worker/WASM chunk 可在 build 产物定位。
- 静态扫描产品 source 不出现 TS factory/runtime/core 或 fallback。
- 所有新增/大改普通文件 `wc -l` ≤300，目录与文件职责符合 index 目标。

写 `reports/001-report.md`，列出最终文件树、验证与任何偏差；不提交、不改状态。

## R1

- 去掉根 `<title>`、header 副标题与 badge class 的 demo 身份，改成 workbook / sales orders /
  row-count 产品语义；只改文案与命名，不改布局或功能。
- 报告产品 source + 迁移测试计数应为 25，不是 24。
- 发现来源：`reports/001-review.md`。

R1 已由 `reports/001-review-v2.md` 独立复审通过。

## R2

- pre-commit ESLint 发现 `test/workbook/rust-backend.test.ts:72` 为 102 字符，超过 100 上限；只做
  语义不变的换行，并显式运行该测试文件 ESLint。

R2 为机械换行，编排者抽查 diff 与显式 ESLint 证据通过。
