# 002 执行报告

状态：DONE（R1）

## 变更

- 新增 `RustWorksheet`，固定以 `orders`、1001×8 sheet 尺寸调用现有 `useSpreadsheetViewport`，并把完整 viewport result 作为单个 prop 交给 `DemoGrid`。
- 新增 32 行受控窗口；一般滚动按 28px 行高换算为绝对 row origin。滚动处理读取真实 `scrollTop`、`scrollHeight` 与 `clientHeight`，到达合法最大滚动位置时直接请求末窗 row 969–1000，覆盖第 1,000 条数据记录。
- `DemoGrid` 只向 `SpreadsheetGridView` 传入 viewport 的 `cells` 与 bounded `window`；当前 DOM 上限为 32×8 = 256 个数据格。
- 行号、数据格 `data-cell` 与 pointer selection 全部保持 sheet 绝对坐标；真实 Chromium 中末条公式格选择为 `G1001`。
- 公式栏只查找当前 Rust projection 中的选中格，优先显示 `formula`，否则显示 `displayValue`；选中格不在当前窗口时为空串。
- loading/error 直接显示在网格区域，error 时不挂载旧单元格。
- 删除静态 `DEMO_CELLS`、coordinate map、静态格式投影与 `getDemoFormulaBarValue`；`demo-data.ts` 仅保留确定性的 sheet 尺寸/列元数据。
- 新窗口布局写入独立 `grid-viewport.css`；R1 将非窗口职责的 runtime 状态条样式移入 `worksheet.css`，窗口 CSS 只保留 frame/window/projection state。

## 验证

- `npx jest excel/react-excel/test/rust-demo-projection.test.tsx --runInBand`：3/3 通过；覆盖 `orders` bounded request、末窗 row 1000、绝对选择/公式栏、256 格 DOM 上限和 projection error。R1 末窗场景定义 `clientHeight=1200`（大于缺陷阈值 924px），只使用合法的 `scrollTop=scrollHeight-clientHeight`，断言请求 row 969–1000。
- `npx jest excel/react-excel/test/rust-demo-projection.test.tsx excel/react-excel/test/use-spreadsheet-viewport.test.tsx excel/react-excel/test/rust-demo-backend.test.ts --runInBand`：3 suites、8/8 通过。
- `pnpm --filter @einfach/react-excel run typecheck:demo`：通过。
- `pnpm --filter @einfach/react-excel run build:demo`：通过；产物包含 Rust worker 与 `einfach_wasm_bg-*.wasm`。
- `npx tsc -b --pretty false`：通过。
- 定向 ESLint：通过。
- `DEMO_CELLS` / `getDemoFormulaBarValue` 定义与引用扫描：零结果。
- React demo 的 TS worker / TS core fallback 禁令扫描：零结果。
- R1 真实 Chromium 1440×1600：滚动容器 `clientHeight=1415`、`scrollHeight=28056`，浏览器 clamp 后的真实 `scrollTop=maxScrollTop=26641`；末窗挂载 256 格，row 1000 可选，地址 `G1001`，公式 `=E1001*F1001`。
- 新增/大改普通文件行数：App 78、DemoGrid 129、RustWorksheet 67、demo-data 18、window hook 26、grid CSS 19、test 170；均不超过 300。`worksheet.css` 259 行。
- `git diff --check`：通过。

未提交；未修改任务状态或 index，保留编排者已有改动。
