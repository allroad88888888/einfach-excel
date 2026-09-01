# 线：React Excel 产品主线
一句话：React demo 请求 Rust/WASM 工作簿投影并把用户编辑确认写回。
类型：主线

## 入口（一个实例从哪开始；引 file:line）
- 浏览器壳提供 `#root` 并加载 `/main.tsx`（`excel/react-excel/demo/index.html:10`、`excel/react-excel/demo/index.html:11`）；`main.tsx` 挂载 `<App />`（`excel/react-excel/demo/main.tsx:16`）。
- 本线机械根是 `main.tsx`；入口闭包默认不含 `index.html` 与构建配置。

## 数据怎么走（逐步；每步引 file:line）
1. **建工作簿** → `App` 建唯一 demo store 与 1,001×8 选择边界（`excel/react-excel/demo/App.tsx:12`），挂载时创建 backend、等 `ready()`、卸载时 `dispose()`（`excel/react-excel/demo/App.tsx:32`、`excel/react-excel/demo/App.tsx:45`、`excel/react-excel/demo/App.tsx:55`）。
2. **装 Rust backend** → backend 选择 lite WASM worker，声明 `orders` sheet，初始化后按 500 个一块导入
   8,008 个 seed cells（`excel/react-excel/demo/rust-demo-backend.ts:70`、
   `excel/react-excel/demo/rust-demo-seed.ts:1`、`excel/react-excel/demo/rust-demo-seed.ts:54`）。
3. **定状态归属** → ready 后，`App` 把同一 backend/store 交给 provider 再渲染 `RustWorksheet`（`excel/react-excel/demo/App.tsx:73`）；provider 只创建 `{backend, store}` core 并放进 context（`excel/react-excel/src/spreadsheet-ui-provider.tsx:16`、`excel/spreadsheet-ui-core/src/createSpreadsheetUi.ts:14`）。
4. **读可见窗口** → `RustWorksheet` 把宿主控制的 32 行 window 交给 viewport hook（`excel/react-excel/demo/RustWorksheet.tsx:33`、`excel/react-excel/demo/use-demo-grid-window.ts:15`）；hook 发 `beginProjectionAtom` 后调用 `backend.readVisibleProjection`（`excel/react-excel/src/use-spreadsheet-viewport.ts:223`、`excel/react-excel/src/use-spreadsheet-viewport.ts:137`）。
5. **到 Rust 再返回** → worker port 把 visible request 交给 `readRange`；后者 RPC `readSparseRange` 并把 Rust snapshots 转成 `DisplayCell`（`excel/solid-excel/src/adapter/worker/ports/projection.ts:23`、`excel/solid-excel/src/adapter/worker/read-range.ts:19`、`excel/solid-excel/src/adapter/worker/read-range.ts:27`）。dispatcher 最终调用 WASM `read_sparse_range`（`excel/solid-excel/src/adapter/worker-runtime-core.ts:51`、`excel/rust/wasm/src/wasm_workbook_diagnostics.rs:122`）。
6. **画网格** → hook 只暴露匹配当前 request/window 的结果（`excel/react-excel/src/use-spreadsheet-viewport.ts:288`）；
   `DemoGrid` 把 cells/window/selection 交给只读 `SpreadsheetGridView`，后者只为窗口坐标生成 `<td>`
   （`excel/react-excel/demo/DemoGrid.tsx:145`、`excel/react-excel/src/SpreadsheetGridView.tsx:217`）。
7. **起编辑会话** → 双击取命中 cell，Enter 取 selection focus cell（`excel/react-excel/demo/DemoGrid.tsx:83`、
   `excel/react-excel/demo/DemoGrid.tsx:135`）；`useDemoCellEdit.start` 只接受当前 projection 的 cell，
   再经 adapter 把 draft 放进 UI-core atoms（`excel/react-excel/demo/use-demo-cell-edit.ts:47`、
   `excel/react-excel/src/use-spreadsheet-editing.ts:44`）。
8. **确认写回并刷新** → editor 的 Enter/blur commit，Escape cancel（`excel/react-excel/demo/DemoCellEditor.tsx:26`、
   `excel/react-excel/demo/DemoCellEditor.tsx:37`）。demo 调 `runEditingCommitAtom` 并传 backend 与
   `viewport.refresh`（`excel/react-excel/demo/use-demo-cell-edit.ts:66`）；UI-core 冻结
   `set-cell-input` request 后调用 `backend.setCellInput`（`excel/spreadsheet-ui-core/src/editing/index.ts:891`、
   `excel/spreadsheet-ui-core/src/editing/index.ts:1016`）。worker 按空串/公式/普通值选择可失败 WASM 写入
   （`excel/solid-excel/src/adapter/worker/ports/cell-input.ts:30`、
   `excel/solid-excel/src/adapter/worker-cell-ops.ts:85`、`excel/rust/wasm/src/wasm_workbook_writes.rs:71`）；
   ACK 后必须重读 projection，刷新失败则保留 retry authority
   （`excel/spreadsheet-ui-core/src/editing/index.ts:1127`、
   `excel/spreadsheet-ui-core/src/editing/index.ts:1141`）。

## 每部分负责什么 / 状态归谁 / 谁能调谁

| 部分 | 职责 | 状态归谁 | 谁可调 | 不许做 |
|---|---|---|---|---|
| `main.tsx` / `App` | 生命周期装配 | App | 浏览器 | 直接改 cell |
| provider/context | 注入 core | UI-core store | adapter hooks | 复制 workbook |
| `RustWorksheet` / demo hooks | 产品组合与 window | React host | demo components | 绕 backend 保存 |
| viewport / editing atoms | 投影、draft、ACK/refresh | UI-core | adapter、host callback | 假定写成功 |
| grid components | 事件坐标与只读 DOM | render-local | demo host | 拉取/写 workbook |
| worker backend / WASM | 权威读写与公式求值 | Rust workbook | backend ports | 依赖 React 状态 |

## 形状（flat `src`，用 import/call 路径人工计数）

- 包内 72 个 tracked files：demo 24、src 18、test 21、e2e 5、包根 4。
- `main.tsx` 源码/资源静态闭包 39/72：demo runtime 21 + src module 18；barrel 转出 16 个 peers，
  pointer selection 再走独立 subpath（`excel/react-excel/src/index.ts:1`、
  `excel/react-excel/package.json:13`）。加浏览器壳 `index.html` 是 40/72。
- **实际 symbol/call 闭包 30/72**：demo runtime 21 + src 9：`index.ts`、
  `spreadsheet-ui-provider.tsx`、`spreadsheet-ui-context.ts`、`SpreadsheetGridView.tsx`、
  `use-spreadsheet-selection.ts`、`use-spreadsheet-value.ts`、`use-spreadsheet-viewport.ts`、
  `use-spreadsheet-pointer-selection.ts`、`use-spreadsheet-editing.ts`。
- 完全在 `main.tsx` 静态闭包外 33/72：`demo/{index.html,tsconfig.json,vite.config.ts}` 3、`test/*` 21、
  `e2e/*` 5、包根 `{README.md,package.json,playwright.config.ts,tsconfig.json}` 4。

## 样板（点名 1–2 个成员 + 为什么：奠基 / 最简 / 最近且干净）

- `use-spreadsheet-viewport.ts`——2026-08-13 奠基，2026-09-01 补 retain-result refresh 的现役投影样板
  （`excel/react-excel/src/use-spreadsheet-viewport.ts:239`）。
- `use-demo-cell-edit.ts`——adapter editing → async core command → backend → projection refresh 的最短完整样板
  （`excel/react-excel/demo/use-demo-cell-edit.ts:33`）。

## 加一个（触碰文件；每项标来源）

- 新产品交互落在 React 产品入口闭包，由 `RustWorksheet.tsx` 或 `DemoGrid.tsx` 装配——来源：
  2026-09-01 六个产品提交的 import/call 汇合点；负责人已确认不再把本项目当通用 adapter。
- 只有当前产品确需的 framework bridge 才保留；不再为未来能力预建公开 hook/barrel surface。
- workbook 读写只穿 `SpreadsheetBackend` 的 projection/cell ports
  （`excel/spreadsheet-ui-core/src/backend/types.ts:1091`）。

## 标准之外

### 标准

- 上述 30/72 call 闭包是当前产品主线；新增写回须保留 backend ACK → projection refresh 顺序。

### 另一类（同包、非当前产品调用）

- 9/18 src 只被 barrel 静态带入、未被 demo 调用：`SpreadsheetFrozenGridView.tsx`、
  `spreadsheet-grid-geometry.ts`、`use-spreadsheet-keyboard-navigation.ts`、
  `use-spreadsheet-ime-composition.ts`、`use-spreadsheet-formula-bar.ts`、`use-spreadsheet-name-box.ts`、
  `use-spreadsheet-sheet-tabs.ts`、`use-spreadsheet-clipboard.ts`、`use-spreadsheet-history.ts`。
  它们仍是标准 adapter surfaces，不因未消费而判漂移（`excel/react-excel/src/use-spreadsheet-history.ts:46`）。
- 入口外 33/72 是验证/开发机制，不用于扩展 runtime。

### 漂移 / 遗留（别模仿，不自动删）

- 18/18 src 生于 2026-08-13 adapter wave；负责人已把产品目标从 adapter 改为完整应用，因此 9 个
  未消费 surface 确认为遗留候选，不作为新实现样板。

### 待确认（≤5；只问改变新代码去向的）

1. **当前产品正在调用的 9 个 src module 是否也立即删除？** A 暂留至产品替代，保证 demo 可运行；
   B 全删并接受 demo 暂时不能构建。精确影响见 `.project-lines/questions.md`。

## 文档与代码不一致处

- 包 README 与根 README 把 React 定位为 private adapter/reference（`excel/react-excel/README.md:4`、
  `README.md:76`）；负责人现已明确它是完整 React Excel 产品，文档需随清理改正。

## 证据核过：commit `5cd1132eab3d82129510c783b5595450d04d5c82`，2026-09-01；打开文件数：67

## 裁决（负责人答复后追加）

- 2026-09-01，负责人：`react-excel` 是完整产品，不是 adapter skeleton；新功能沿产品主线落位。
- 2026-09-01，负责人：React 产品只接现成 Rust worker，不接 TS core/runtime/fallback。
