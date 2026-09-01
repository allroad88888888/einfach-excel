# 线：React demo 的 Rust 数据主线

一句话：React demo 直接启动 lite WASM worker，把种子、可见区读取与编辑都经同一套 RPC 落到 Rust `Workbook`，再以投影或 mutation ACK 回到 UI。

类型：主线

## 入口（一个实例从哪开始；引 file:line）

- 页面入口在 `App`：创建 backend，等待 `ready`，按 loading/error/ready 分支渲染，并在 effect 清理时 `dispose`；ready 后把 backend 注入 UI provider（`excel/react-excel/demo/App.tsx:29-76`）。
- backend 入口只导入 `@einfach/solid-excel/worker-backend` 与 `@einfach/solid-excel/vnext-worker-runtime?worker`，worker factory 直接 `new RustWorkbookWorker()`；这里没有 TS factory/runtime 或主线程 fallback（`excel/react-excel/demo/rust-demo-backend.ts:1-2`, `excel/react-excel/demo/rust-demo-backend.ts:74-83`）。
- 包子路径把 `worker-backend` 指到中性 adapter，把 `vnext-worker-runtime` 指到 lite WASM 叶子入口；二者是 React demo 构建不可缺的跨包入口（`excel/solid-excel/package.json:39-49`）。
- lite 叶子静态导入 `@einfach/excel-wasm` 后把模块交给共享 dispatcher（`excel/solid-excel/src/adapter/worker-runtime.ts:3-16`, `excel/solid-excel/src/adapter/worker-runtime.ts:31`）；host 在 init 后创建唯一 `WasmWorkbook`（`excel/solid-excel/src/adapter/worker-workbook-host.ts:27-58`）。

## 数据怎么走（逐步；每步引 file:line）

1. `App` 调 `createRustDemoBackend`；adapter 创建 client/state，组合 20 族 SpreadsheetBackend 端口，并由 session 初始化 `orders` sheet 后执行 `afterInit`（`excel/solid-excel/src/adapter/worker/backend.ts:30-68`, `excel/solid-excel/src/adapter/worker/session.ts:50-64`）。
2. seed 生成 1,000 行 × 8 列加表头，共 8,008 cells，并以 500 格为上限分块（`excel/react-excel/demo/rust-demo-seed.ts:1-5`, `excel/react-excel/demo/rust-demo-seed.ts:36-70`）。
3. import 依次发 `beginImport(direct)` → 多个 `importChunk` → `commitImport`；每块核对的是累计 `normalizedCount`，失败即 `cancelImport`，commit 还核对 accepted/错误/拒绝公式（`excel/react-excel/demo/rust-demo-backend.ts:22-68`）。
4. client 为每个请求分配 id、保存 pending promise、发 `postMessage`；worker 回 `{id, ok, result|error}` 后 resolve/reject（`excel/solid-excel/src/adapter/worker-protocol/client.ts:24-64`, `excel/solid-excel/src/adapter/worker-post.ts:22-35`）。
5. dispatcher 等 WASM 初始化完成，以 13 个 command handler 中首个命中的 handler 执行；异常统一编码回 RPC error（`excel/solid-excel/src/adapter/worker-runtime-core.ts:30-72`）。
6. direct import 的 worker session 逐块把 wire cell 规范化后调用 `bulk_import_cells`，回执 `normalizedCount` 是 session 累计值；commit 回最终 stats（`excel/solid-excel/src/adapter/worker-commands-sessions.ts:55-150`）。
7. WASM binding 反序列化单元格并交给 Rust `Workbook::bulk_load`；loader 按 sheet 缓冲、保持操作顺序并批量 flush（`excel/rust/wasm/src/wasm_workbook_import.rs:3-13`, `excel/rust/excel-core/src/workbook_loader.rs:36-45`, `excel/rust/excel-core/src/workbook_loader.rs:163-175`）。
8. ready 后 `RustWorksheet` 把 selection/window 交给 `useSpreadsheetViewport`，只读 `orders` 的当前窗口（`excel/react-excel/demo/RustWorksheet.tsx:33-60`）。
9. viewport 调 backend `readVisibleProjection`；worker port 转成 `readRange`，client 发 `readSparseRange`，WASM `read_sparse_range` 遍历 Rust 稀疏范围并把 formula/display/type/error 快照回传（`excel/react-excel/src/use-spreadsheet-viewport.ts:137-165`, `excel/solid-excel/src/adapter/worker/ports/projection.ts:16-35`, `excel/solid-excel/src/adapter/worker/read-range.ts:19-40`, `excel/rust/wasm/src/wasm_workbook_diagnostics.rs:122-158`）。
10. adapter 把 snapshot 转成 UI `DisplayCell`，附 revision；viewport 只接受匹配 request/range 的结果，`DemoGrid` 只渲染 `viewport.cells`（`excel/solid-excel/src/adapter/worker/snapshot-to-cell.ts:8-49`, `excel/solid-excel/src/adapter/worker/read-range.ts:86-90`, `excel/react-excel/src/use-spreadsheet-viewport.ts:239-265`, `excel/react-excel/demo/DemoGrid.tsx:145-150`）。
11. 编辑由 UI-core 组装精确 `setCellInput` request 并执行 backend ticket；worker 根据输入选择 clear/formula/value，调用 fallible WASM 写入，成功 bump revision 并 ACK 影响范围（`excel/spreadsheet-ui-core/src/editing/index.ts:813-898`, `excel/spreadsheet-ui-core/src/editing/index.ts:1008-1090`, `excel/solid-excel/src/adapter/worker/ports/cell-input.ts:30-65`）。
12. WASM 的 `trySetCell*` / `trySetFormulaAt` 调 Rust `Workbook::try_set_cell` / `try_set_formula`；拒绝转结构化 code，成功 ACK 后 demo refresh 投影（`excel/rust/wasm/src/wasm_workbook_writes.rs:58-145`, `excel/rust/wasm/src/wasm_write_errors.rs:1-57`, `excel/react-excel/demo/use-demo-cell-edit.ts:66-82`）。
13. dispose 移除 listener、拒绝 pending、清订阅并 terminate worker，闭合整个生命周期（`excel/solid-excel/src/adapter/worker-protocol/client.ts:132-144`）。

## 每部分负责什么 / 状态归谁 / 谁能调谁

| 部分 | 职责 | 持有的状态 | 谁可以调它 | 不许做 |
|---|---|---|---|---|
| React demo | 生命周期、种子、窗口/选择、编辑交互 | loading/error、selection/window/edit draft（`excel/react-excel/demo/App.tsx:29-58`, `excel/react-excel/demo/RustWorksheet.tsx:33-46`） | 页面与用户交互 | 直接调 worker client/WASM |
| UI-core | 投影与 mutation ticket/ACK 语义 | intent、pending、acknowledged/rejected（`excel/spreadsheet-ui-core/src/editing/index.ts:1008-1133`） | React host | 识别 worker/WASM 实现 |
| Solid worker adapter | client、session、RPC、revision、wire↔UI 转换 | request/pending/subscription/revision（`excel/solid-excel/src/adapter/worker-protocol/client.ts:24-56`, `excel/solid-excel/src/adapter/worker/session.ts:12-17`） | UI-core backend ports | 在主线程复制 Workbook 真值 |
| WASM binding | JS/Rust 边界、序列化、结构化拒绝 | `WasmWorkbook { workbook, subscriptions }`（`excel/rust/wasm/src/lib.rs:63-73`） | worker runtime | 回传成功形状来吞掉 Rust 拒绝 |
| Rust excel-core | 工作簿真值、Store 依赖图、公式、稀疏读写 | Store/sheets/names/revision（`excel/rust/excel-core/src/workbook.rs:103-119`） | WASM binding | 回调 React 或持有 UI 状态 |

## 形状（分支线：目录/文件形状 + 计数；必需 vs 可选）

- 基线 `5cd1132eab3d82129510c783b5595450d04d5c82` 即当前 HEAD；`baseline..HEAD` 为 0 commit。五个代表文件各只有 1 条现路径历史：demo seed/backend 在 `5e6e00fa` 新增，worker backend/runtime 在 `14708c26` promote，WASM diagnostic/core write 在 `4b4ab2e0` stabilize；因此不能用现路径 commit 数推断代码年轻或可删。
- 全仓 extractor 在 excel 子包没有 ≥60% hub；沿精确引用人工数得：React demo 对 `vnext-worker-runtime?worker` 是 1 个生产 import、另 1 个测试 mock；本主线 backend 组装 20/20 个端口族（`excel/solid-excel/src/adapter/worker/backend.ts:36-57`），WASM runtime 注册 13 个 handler（`excel/solid-excel/src/adapter/worker-runtime-core.ts:35-49`）。
- 不是单文件 hub，而是“公共 backend 契约 → worker adapter → RPC → WASM surface → Rust Workbook”的跨包窄腰；`WasmWorkbookRuntime` 特意只声明 worker 可调用的 fallible 写入与稀疏读取（`excel/solid-excel/src/adapter/wasm-workbook-surface.ts:49-113`）。
- 必需：demo backend/seed、worker-backend、client/protocol、lite runtime/core、WASM binding、Rust Workbook；可选：full Rust 叶子与 TS 引擎，均不在当前 React 产品图内（`excel/react-excel/demo/rust-demo-backend.ts:1-2`, `excel/solid-excel/src/adapter/worker-runtime-full.ts:3-21`）。

## 样板（点名 1–2 个成员 + 为什么：奠基 / 最简 / 最近且干净）

- `excel/react-excel/demo/rust-demo-backend.ts:1-83`——最近且干净的 Rust-only host 样板：中性 backend、直接 worker 叶子、初始化导入都在一个边界。
- `excel/react-excel/src/use-spreadsheet-viewport.ts:137-165`——最简投影消费样板：只调 backend contract，不泄漏 client/WASM。

## 加一个（触碰文件；每项标来源：git 配方交集 / 汇合点代码 / 已有清单；不一致处写出）

- React demo 数据——来源：git 配方交集。改 seed/import 调用，继续让 `afterInit` 承担首开导入；不把工作簿真值搬进 React（`excel/solid-excel/src/adapter/worker/session.ts:50-64`）。
- 投影字段——来源：汇合点代码。从 Rust sparse snapshot → WASM wire → worker snapshot mapper → UI backend contract 纵向贯通；不在 grid 根据 seed 重算（`excel/rust/wasm/src/wasm_workbook_diagnostics.rs:122-158`, `excel/solid-excel/src/adapter/worker/snapshot-to-cell.ts:8-49`）。
- mutation——来源：已有清单/契约。扩 backend contract、worker protocol、fallible WASM export、Rust Workbook；resolved mutation 必须表示已经落地，失败 reject（`excel/spreadsheet-ui-core/src/backend/types.ts:1091-1118`）。
- Rust-only host——来源：汇合点代码。不改 `worker-factory.ts`，不导入 TS runtime，不造主线程 fallback（`excel/react-excel/demo/rust-demo-backend.ts:1-2`, `excel/solid-excel/src/adapter/worker-runtime.ts:3-16`）。

## 标准之外

### 另一类（同目录、不同机制）

- `worker-factory.ts` 是通用宿主入口：默认 factory 仍启动 lite WASM；它同时提供 TS factory，二者共享 wire/backend，但这不等于 React demo 可混用（`excel/solid-excel/src/adapter/worker-factory.ts:23-39`）。
- TS worker 是真实、受测的另一引擎实现，不是本主线漂移：专用 entry 安装 `worker-runtime-ts`，后者有自己的 state/dispatch，并明确依赖 `@einfach/excel-core-ts`（`excel/solid-excel/src/adapter/worker-entry-ts.ts:4-16`, `excel/solid-excel/src/adapter/worker-runtime-ts.ts:3-32`, `excel/solid-excel/src/adapter/worker-runtime-ts.ts:93-140`）。
- full WASM 也是 Rust 的显式 opt-in 变体：与 lite 共用 dispatcher，但静态 import `@einfach/excel-wasm/full`，不能由 barrel/factory 隐式拉入（`excel/solid-excel/src/adapter/worker-runtime-full.ts:3-21`）。

### 漂移 / 遗留（少、晚、不合形状——引用并说明；是「别模仿」不是「删」）

- `worker-workbook-backend.ts` 现在只是兼容入口/re-export，真实实现已拆到 `worker/`；它仍被 adapter barrel 公开，因此“React demo 未使用”不能推出可删（`excel/solid-excel/src/adapter/worker-workbook-backend.ts:1-27`, `excel/solid-excel/src/adapter/index.ts:1-10`）。
- `solid-excel/README` 仍把 factory + 根 barrel 写成普通宿主范式，没有记录 React demo 为满足 Rust-only 而采用的中性 backend 子路径 + 直接 `?worker` 叶子组合（`excel/solid-excel/README.md:64-84`）。这是文档覆盖滞后，不是 factory 已废弃。

### 待确认（≤5；只问改变新代码去向的；点名成员；每条两种解释）

1. React 产品固定 `worker-backend` + 直接 Rust worker；TS worker 仅是 Solid 其它宿主的另一类。
2. lite/full 选择等出现需要 full 方言的具体产品功能时再裁，不驱动当前清理。

## 文档与代码不一致处

- `excel/solid-excel/README.md:70-84` 只写 factory 方案；当前 React demo 的产品代码明确绕过 factory，直接选 Rust lite worker（`excel/react-excel/demo/rust-demo-backend.ts:1-2`）。
- Rust/WASM 文档正确区分 lite/full/TS 三条轴，也说明 worker runtime core 是现役消费者（`excel/rust/wasm/README.md:87-103`, `excel/rust/wasm/README.md:184-220`）；但它的示例仍使用非 `vnext-` 别名，而 package 同时保留两组等价子路径（`excel/solid-excel/package.json:33-73`）。
- `excel/excel-wasm/README.md:1-20` 只描述预构建 WASM 包入口，不能单独证明 React 已走 Rust；产品边界必须以 demo import 与 worker runtime 静态 import 为准。

## 证据核过：commit `5cd1132eab3d82129510c783b5595450d04d5c82`，2026-09-01；本次打开文件数：51

## 裁决（负责人答复后追加——日期、人；保留问题编号）

- 2026-09-01，负责人：React 产品只接现成 Rust worker；禁止 TS core/runtime/fallback。
