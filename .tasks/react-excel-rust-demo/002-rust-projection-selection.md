---
id: "002"
title: 用 Rust 投影实现滚动与选择
kind: leaf
depends_on: ["001"]
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
files:
  - excel/react-excel/demo/App.tsx
  - excel/react-excel/demo/DemoGrid.tsx
  - excel/react-excel/demo/RustWorksheet.tsx
  - excel/react-excel/demo/demo-data.ts
  - excel/react-excel/demo/use-demo-grid-window.ts
  - excel/react-excel/demo/worksheet.css
  - excel/react-excel/demo/grid-viewport.css
  - excel/react-excel/test/rust-demo-projection.test.tsx
  - .tasks/react-excel-rust-demo/reports/002-report.md
---

# 用 Rust 投影实现滚动与选择

## 目标

让 1000 行网格只渲染 Rust backend 返回的当前可见窗口。

## 实现合同

- `RustWorksheet` 使用现有 `useSpreadsheetViewport`，sheetId 固定为 `orders`，并把
  当前投影分别交给公式栏与 `DemoGrid`。
- `RustWorksheet` 把完整 viewport result 作为一个 prop 传给 `DemoGrid`；003 可在
  该 result 增加 `refresh` 后直接消费，不再回改 composition 文件。
- sheet 尺寸固定为 1001×8；滚动位置换算成 bounded row window。
- 只把 hook 返回的 `cells` 交给 `SpreadsheetGridView`，删除 `DEMO_CELLS` 常量与静态
  coordinate map；`demo-data.ts` 只保留 seed 所需的确定性行数据。
- 行号、选区坐标均保持 sheet 绝对坐标；第 1000 条记录必须可达并可选择。
- loading/error 状态在网格区域可见；不得用旧静态单元格遮盖 Rust 读取错误。
- 公式栏从当前 Rust projection 读取选中格的 formula/display，不再调用静态
  `getDemoFormulaBarValue`；选中格暂不在窗口时显示空串。
- `worksheet.css` 当前 252 行；新增窗口布局放进 `grid-viewport.css`，禁止把前者顶破 300 行。

## 验收

- React 测试证明 projection request 使用 `orders` 与 bounded window。
- React 测试证明滚到末尾后请求覆盖第 1000 条数据，选择坐标仍正确。
- DOM 中数据单元格数量受窗口上限约束，不出现 8008 个常驻单元格。
- demo 中 `DEMO_CELLS`、`getDemoFormulaBarValue` 零定义零引用；typecheck 与 demo build 通过。
- 所有新增/大改普通文件 `wc -l` ≤300。

写 `reports/002-report.md`；执行 agent 不提交。
