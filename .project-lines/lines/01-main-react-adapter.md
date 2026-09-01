# 线：React 适配层主线
一句话：`@einfach/react-excel` 把 React 宿主接入框架无关 UI core，再把受控投影交回宿主。
类型：主线

## 入口（一个实例从哪开始；引 file:line）
- workspace 把 `excel/*` 收为包；React 包的 `.` 指向 `src/index.ts`，另有独立的 `./pointer-selection` 子路径（`pnpm-workspace.yaml:1`；`excel/react-excel/package.json:7`）。
- 根 barrel 人工按导出名计得 16 个运行时值、26 个类型；入口测试逐项锁住 16 个运行时值（`excel/react-excel/src/index.ts:1`；`excel/react-excel/test/package-entry.test.ts:24`）。
- 实例入口是宿主把一个 `SpreadsheetBackend`、可选 `Store` 交给 `SpreadsheetUiProvider`（`excel/react-excel/src/spreadsheet-ui-provider.tsx:10`）。

## 数据怎么走（逐步；每步引 file:line）
1. 声明 → `SpreadsheetUiProvider` 用 `createSpreadsheetUi({ backend, store })` 建 `{ backend, store }`；没传 store 才由 core 创建（`excel/react-excel/src/spreadsheet-ui-provider.tsx:16`；`excel/spreadsheet-ui-core/src/createSpreadsheetUi.ts:14`）。
2. 注册 → Provider 按 `[backend, store]` memo core，再写入 React Context；backend/store 身份改变会替换该边界的 core（`excel/react-excel/src/spreadsheet-ui-provider.tsx:21`；`excel/react-excel/src/spreadsheet-ui-context.ts:5`）。
3. 触发 / 渲染 → Provider-bound hook 先取最近的 core；读状态的 hook 把 `store.getter/sub(atom)` 包成 source，再由 `useSyncExternalStore` 订阅（`excel/react-excel/src/use-spreadsheet-selection.ts:7`；`excel/react-excel/src/use-spreadsheet-value.ts:15`）。无 Provider 时 context hook 立即报错（`excel/react-excel/src/spreadsheet-ui-context.ts:8`）。
4. 执行 / 读写 → viewport 先写 `beginProjectionAtom`，再调用必需 port `backend.readVisibleProjection`，结果写回 `resolveProjectionAtom`/`rejectProjectionAtom`（`excel/react-excel/src/use-spreadsheet-viewport.ts:137`；`excel/react-excel/src/use-spreadsheet-viewport.ts:223`；`excel/spreadsheet-ui-core/src/backend/types.ts:1091`）。selection/pointer/editing 则派发 core atoms；例如 pointer 同时推进 selection 与 pointer session（`excel/react-excel/src/use-spreadsheet-pointer-selection.ts:57`；`excel/spreadsheet-ui-core/src/pointer/index.ts:518`）。
5. 结果去哪 → viewport 只返回当前 request 对应的 cells/status/error，`SpreadsheetGridView` 只渲染 caller-owned window/cells/selection（`excel/react-excel/src/use-spreadsheet-viewport.ts:288`；`excel/react-excel/src/SpreadsheetGridView.tsx:199`；`excel/react-excel/src/SpreadsheetGridView.tsx:216`）。包内 demo 把这三者合在 `RustWorksheet → DemoGrid`（`excel/react-excel/demo/RustWorksheet.tsx:33`；`excel/react-excel/demo/DemoGrid.tsx:145`）。
6. 确认式编辑 → demo 用 React hook 管 session/draft，却直接派发 core 的 `runEditingCommitAtom`；该命令冻结 `backend.setCellInput`，等待 ACK 后调用 caller-owned projection refresh（`excel/react-excel/demo/use-demo-cell-edit.ts:33`；`excel/spreadsheet-ui-core/src/editing/index.ts:298`；`excel/spreadsheet-ui-core/src/editing/index.ts:1016`；`excel/spreadsheet-ui-core/src/editing/index.ts:1141`）。

## 每部分负责什么 / 状态归谁 / 谁能调谁
| 部分 | 职责 | 持有的状态 | 谁可以调它 | 不许做 |
|---|---|---|---|---|
| package exports / barrel | 定义可导入入口 | 无 | workspace 消费者 | 偷带默认 backend；包仍是 private（`excel/react-excel/package.json:2`） |
| Provider / Context | 隔离一个 core 身份 | memo 的 `{backend, store}` 引用 | React 子树 | 自建第二份表格产品状态（`excel/react-excel/src/spreadsheet-ui-provider.tsx:20`） |
| React hooks | 把 React 生命周期/事件翻译成 store 读写 | memo/ref 等桥接状态；受控 window 仍归宿主 | Provider 子树；两个 standalone hook 例外 | 绕过 core 私有 backing atoms；projection backing 明确只在 core 模块可写（`excel/spreadsheet-ui-core/src/projection/index.ts:424`） |
| UI-core atoms | 归一化 selection、projection、editing 生命周期 | Einfach store 内的产品状态 | adapter 经公开 atoms/commands | 依赖 React；core 根入口只导出框架无关模块（`excel/spreadsheet-ui-core/src/index.ts:11`） |
| backend ports | 执行宿主拥有的读写能力 | 引擎/worker 数据 | core command 或受控 transport | 把 resolve 当作假 ACK；`setCellInput` 必须真实落盘（`excel/spreadsheet-ui-core/src/backend/types.ts:1110`） |
| Grid / geometry | 显示受控投影、计算坐标 | 无产品状态 | React 宿主 | 自取 cells 或提交编辑（`excel/react-excel/src/SpreadsheetGridView.tsx:216`；`excel/react-excel/src/spreadsheet-grid-geometry.ts:151`） |
| demo 宿主 | 持有 backend、window、装配策略 | 加载状态、受控 viewport window | Vite demo / site island | 被当作通用 adapter API（`excel/react-excel/demo/App.tsx:29`；`excel/react-excel/demo/use-demo-grid-window.ts:15`） |

## 形状（分支线：目录/文件形状 + 计数；必需 vs 可选）
- 这是 flat-src 主线，不是目录家族：tracked `src` 共 18 文件；其中 hook 12 个。人工按 `useSpreadsheetUiCore` 调用计得 10/12 为 Provider-bound，另外 2/12 见“另一类”（`excel/react-excel/src/spreadsheet-ui-context.ts:8`）。
- 10 个 Provider-bound hooks 中 8/10 通过 `useSpreadsheetValue` 订阅 atoms；pointer、keyboard 2/10 仅派发命令/读取即时 intent（`excel/react-excel/src/use-spreadsheet-pointer-selection.ts:40`；`excel/react-excel/src/use-spreadsheet-keyboard-navigation.ts:25`）。
- 18 个 src 文件中 15/18 直接 import `@einfach/spreadsheet-ui-core`；`index.ts`、`use-spreadsheet-value.ts`、`use-spreadsheet-ime-composition.ts` 不 import core（`excel/react-excel/src/index.ts:1`；`excel/react-excel/src/use-spreadsheet-ime-composition.ts:1`）。
- 必需：Provider-bound hook 从 Context 取 core；读状态时用 stable source + `useSyncExternalStore`；写操作派发公开 command atom。可选：只有需要 transport 的 hook 才拿 backend，只有 DOM 事件适配才返回 React handlers（`excel/react-excel/src/use-spreadsheet-history.ts:46`；`excel/react-excel/src/use-spreadsheet-pointer-selection.ts:19`）。
- core backend 只有 3 个必需 port：visible projection、range projection、cell input；其余能力都是可选 port（`excel/spreadsheet-ui-core/src/backend/types.ts:1091`）。

## 样板（点名 1–2 个成员 + 为什么：奠基 / 最简 / 最近且干净）
- `use-spreadsheet-selection.ts`——最简只读样板：core/store → stable source → `useSpreadsheetValue`，birth commit `aca65df`（`excel/react-excel/src/use-spreadsheet-selection.ts:7`）。
- `use-spreadsheet-history.ts`——需要 backend 的确认式命令样板：同时订阅派生状态，把 backend 注入 core command，birth commit `c905c65`（`excel/react-excel/src/use-spreadsheet-history.ts:46`；`excel/react-excel/src/use-spreadsheet-history.ts:75`）。

## 加一个（触碰文件；每项标来源：git 配方交集 / 汇合点代码 / 已有清单；不一致处写出）
- `excel/spreadsheet-ui-core/src/<domain>/…` + `src/index.ts`——仅当新 React surface 需要新的框架无关 state/command/port；来源：汇合点代码，现有 hooks 只消费 core 根导出（`excel/spreadsheet-ui-core/src/index.ts:1`）。
- `excel/react-excel/src/use-spreadsheet-<feature>.ts`（或单责 component）+ 对应 focused test——来源：6 次根入口成员 birth（selection/viewport/editing/keyboard/IME/formula）都新增实现与同名测试。
- `excel/react-excel/src/index.ts` + `excel/react-excel/test/package-entry.test.ts`——来源：上述 6 次 birth commit 触碰集人工取交集，恰为这 2 个文件；当前测试仍逐项断言根运行时面（`excel/react-excel/test/package-entry.test.ts:24`）。
- `excel/react-excel/package.json`——只在新增 package subpath 时触碰；来源：pointer birth commit `7fa5ecc` 的另一配方，现有 pointer 没进根 barrel（`excel/react-excel/package.json:13`）。
- `excel/react-excel/demo/*` 或 site island——只有要展示/验收才接；不是 root API birth 配方必需项。来源：demo 消费闭包（`excel/react-excel/demo/App.tsx:73`；`excel/excel-site/src/islands/ReactAdapterDemoIsland.tsx:94`）。

## 标准之外
### 另一类（同目录、不同机制）
- `useSpreadsheetValue`——standalone external-store primitive，不取 Provider；它还能观察 caller supplied source（`excel/react-excel/src/use-spreadsheet-value.ts:3`）。
- `useSpreadsheetImeComposition`——standalone React event/ref guard，不读写 core（`excel/react-excel/src/use-spreadsheet-ime-composition.ts:21`）。
- `SpreadsheetGridView`、`SpreadsheetFrozenGridView`、`getSpreadsheetGridGeometry`——3 个 controlled/pure projection surfaces，不是 atom hooks（`excel/react-excel/src/SpreadsheetFrozenGridView.tsx:25`；`excel/react-excel/src/spreadsheet-grid-geometry.ts:151`）。
- site 的 React demo 是固定 4×4 caller-owned projection；它提供不会执行的 deterministic backend，只验证 Provider + selection + pointer + grid（`excel/excel-site/src/islands/ReactAdapterDemoIsland.tsx:23`；`excel/excel-site/src/islands/ReactAdapterDemoIsland.tsx:30`）。
### 漂移 / 遗留（少、晚、不合形状——引用并说明；是「别模仿」不是「删」）
- 未发现可直接定性的结构漂移。`useSpreadsheetEditing.commit()` 仍调用 core 明示为 legacy intent-only 的 `commitEditingAtom`，而 2026-09-01 demo 改走 acknowledged `runEditingCommitAtom`；在 #2 裁决前只记“遗留候选”，不能据此删 API（`excel/react-excel/src/use-spreadsheet-editing.ts:60`；`excel/spreadsheet-ui-core/src/editing/index.ts:794`；`excel/react-excel/demo/use-demo-cell-edit.ts:66`）。
- 包内 Vite demo 人工对账消费 8/17 个公开运行时值：根 7/16，加 pointer 子路径 1/1。未消费的是 `SpreadsheetFrozenGridView`、`getSpreadsheetGridGeometry`、keyboard、IME、formula-bar、name-box、sheet-tabs、clipboard、history；“当前 demo 未接线”不等于漂移或可删（`excel/react-excel/src/index.ts:1`；`excel/react-excel/demo/DemoGrid.tsx:1`）。
### 待确认（≤5；只问改变新代码去向的；点名成员；每条两种解释）
1. **当前产品仍调用的最小 bridge 是否立即删除？** A 保留至产品替代；B 全删并暂时打断 demo。
   精确模块与影响见 `.project-lines/questions.md`。

## 文档与代码不一致处
- README 说 Provider-bound hooks 的 exception 是 `useSpreadsheetValue`；代码还有不取 Provider 的 `useSpreadsheetImeComposition`（`excel/react-excel/README.md:68`；`excel/react-excel/src/use-spreadsheet-ime-composition.ts:21`）。
- README 把 pointer 与其它 hooks 并列，却没说明它只能从 `@einfach/react-excel/pointer-selection` 导入；根 barrel 没导出它（`excel/react-excel/README.md:38`；`excel/react-excel/package.json:13`；`excel/react-excel/src/index.ts:1`）。
- README 说本地 demo 的 formula bar 只读，clipboard/sheet/history commands 未接线；代码吻合：formula bar 用 `<output>`，ribbon/footer 只是按钮外观（`excel/react-excel/README.md:21`；`excel/react-excel/demo/FormulaBar.tsx:7`；`excel/react-excel/demo/WorkbookRibbon.tsx:34`；`excel/react-excel/demo/WorkbookFooter.tsx:6`）。

## 证据核过：commit `5cd1132eab3d82129510c783b5595450d04d5c82`，2026-09-01；本次打开文件数：53

## 裁决（负责人答复后追加——日期、人；保留问题编号）
- 2026-09-01，负责人：本项目目标是完整 React Excel 产品；不再扩张通用 adapter 公开面。
- 2026-09-01，负责人：包内 Rust/WASM 应用是产品入口；site 固定 projection 仅属另一类示例。
