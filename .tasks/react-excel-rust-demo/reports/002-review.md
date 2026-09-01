# CHANGES_REQUIRED

复核日期：2026-09-01

复核基准：`5e6e00fa914a4e3b867123d57a7e96d0628e27f5`

复核范围：完整阅读 `002-rust-projection-selection.md`、`index.md` 与
`reports/002-report.md`；核对任务 `files` 的全部 tracked diff 与 untracked 新文件；静态
追踪现有 `useSpreadsheetViewport` clamp、GridView DOM 生成、pointer selection 与 demo
CSS 几何。未重跑报告已经执行的 Jest、typecheck、build、ESLint、扫描、Chromium 或
`git diff --check`；未修改产品、任务状态或 index。

## Findings

### Critical

无。

### Important

#### 1. 固定 32 行窗口在高视口中无法滚到末行；末行测试使用浏览器不可能产生的 scrollTop

`DemoGrid.tsx:66-67` 把真实 `scrollTop` 直接换算为
`floor(scrollTop / 28)`，再交给 viewport hook clamp。要得到末窗 row 969–1000，传入
origin 必须至少为 969，即 `scrollTop >= 969 * 28 = 27,132px`。

CSS 同时把 frame 高度设为 `(1001 + 1) * 28 = 28,056px`
（`DemoGrid.tsx:57-59`、`grid-viewport.css:1-3`）。浏览器真实最大滚动位置为
`scrollHeight - clientHeight`；因此只有当网格滚动容器高度 `<= 28,056 - 27,132 =
924px` 时，当前换算才能请求 rowStart 969。若容器高于 924px（例如常见 1440px 高桌面
扣除 workbook chrome 后仍可能超过该阈值），最大 origin 会小于 969，固定 32 行 table
又只覆盖 896px，最后若干 sheet 行不会挂载，也无法选择。此时底部会出现空白，而用户
无法完成“滚到任意行/第 1000 条记录”的合同。

`rust-demo-projection.test.tsx:116-124` 用
`fireEvent.scroll(... scrollTop: Number.MAX_SAFE_INTEGER)` 规避了这个真实上限。JSDOM 接受
任意注入值，但浏览器会把 `scrollTop` clamp 到可滚范围；所以该测试只证明 viewport hook
能 clamp 一个不可能的输入，不能证明 CSS/scroll geometry 使末行可达。报告中的
1440×900 Chromium 场景因为容器必然低于 924px，恰好遮住了该缺陷。

修复要求：让 bottom scroll 在任意可支持视口高度下都映射到最后一个 bounded window，
或让受控窗口高度随可见区域变化但仍维持明确 DOM 上限。新增真实几何测试：给 scroller
定义可信的 `scrollHeight`/`clientHeight`，只使用
`scrollHeight - clientHeight` 作为最大 `scrollTop`，至少覆盖一个 `clientHeight > 924`
的场景，并断言 request 到达 row 969–1000、row 1000 实际挂载及可选择。不要再以
`Number.MAX_SAFE_INTEGER` 作为末端可达证据。

### Minor

#### 1. `grid-viewport.css` 混入了非 viewport 的 runtime status 样式

`grid-viewport.css:1-19` 负责虚拟窗口 frame/offset/state；`21-26` 的
`.rust-runtime-status` 则属于 workbook chrome 状态条，变化原因与滚动窗口无关。任务合同
也明确该文件用于“窗口布局”。这没有造成功能错误或超限，但不满足严格 SRP。可将状态条
样式放回组件 inline，或移入仍为 252 行且职责匹配的 `worksheet.css`（修后仍低于 300）。

## 其余验收核对

### Rust projection 唯一数据源：通过

- `demo-data.ts` 已删除 `DEMO_CELLS`、静态 coordinate map、格式投影与
  `getDemoFormulaBarValue`；任务范围内没有同名定义或引用。
- `RustWorksheet.tsx:36-42` 固定以 `orders`、1001×8 调用既有
  `useSpreadsheetViewport`；`DemoGrid.tsx:112-116` 只把 `viewport.cells` 与
  `viewport.window` 交给 `SpreadsheetGridView`。loading/error 分支不挂载 GridView，
  没有静态 cell fallback。
- 行/列标题与 footer record count 是 sheet chrome/元数据，不构成第二份 cell projection。

### DOM 上限、绝对坐标与公式栏：除末行几何外通过

- bounded window 为 32×8；`SpreadsheetGridView` 按 window 生成 td，因此 ready 状态恒为
  256 个数据格，loading/error 为 0，不会常驻 8,008 格。
- GridView 的 `data-cell` 直接使用 window 的绝对 row/col；行号以
  `viewport.window.rowStart + index + 1` 计算，pointer handler 优先从真实 event target
  读取绝对 `data-cell`，pointer capture move 才回退 `elementFromPoint`。坐标没有被重置为
  0–31。
- `RustWorksheet.tsx:43-46,56-59` 只在当前 `viewport.cells` 查找绝对选中格，优先
  formula、其次 displayValue，不在窗口时为空串；不再读取静态公式 map。

### loading/error 与请求时序：通过

- viewport 非 ready 时网格区域显示 loading；error 时显示 role alert 且不挂载 td。
- controlled window 改变后，旧 projection 因 request/window 不匹配不会继续显示；既有
  hook 先进入 idle/loading，再只接收当前 window result，未见旧 Rust window 冒充新窗口。

### 测试真实性：部分通过

- 首窗测试同时断言真实 backend double 收到 `orders`/bounded request、projection 文本
  “Order”进入公式栏、DOM 为 256；不是单纯断言组件自身常量。
- error 测试由 backend reject 驱动，断言 alert 与零 td，能够防止静态 fallback。
- 末窗测试的绝对 selection/formula 断言在“窗口已经到达 row 1000”的前提下有效；但其
  scroll 输入是假阳性，不能关闭真实末行可达验收，详见 Important 1。

### Rust-only、范围、行数与职责：除上述 Minor 外通过

- demo 变更没有引入 `worker-factory`、`defaultExcelCoreTsWorkerFactory`、
  `worker-runtime-ts`、`worker-entry-ts` 或 `@einfach/excel-core-ts`；002 没有修改
  Solid/Rust/WASM 实现。
- 产品 diff 与 untracked 文件均落在任务 `files`；`worksheet.css` 在白名单但无 diff，
  task/index 的 running/base 是编排者账本变更，未见其他越界产品文件。
- 报告记录 App 78、DemoGrid 123、RustWorksheet 67、demo-data 18、window hook 26、
  grid CSS 26、test 155，均 `<=300`；`worksheet.css` 保持 252。除
  `grid-viewport.css` 的小型职责混入外，组件、window owner、metadata 与测试边界清晰，
  无 `utils`/`partN` 假拆分。

## 结论

Rust projection 已成为唯一 cell 数据源，DOM/绝对坐标/公式栏/error/Rust-only 边界主体
正确；但真实 scroll geometry 只在滚动容器不高于 924px 时才能触达 row 1000，现有测试
用不可实现的 `Number.MAX_SAFE_INTEGER` 形成假阳性。该 Important 未修前结论为
CHANGES_REQUIRED。
