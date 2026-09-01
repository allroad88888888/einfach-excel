# React Excel · Rust/WASM 任务树 v4 独立终审

结论：**NEEDS_CHANGES**

审查日期：2026-09-01  
审查基线：产品 HEAD `fc174dfc7a9542ea6c198747d644d24c737f6a27`；任务树未提交。  
范围：完整读取 `index.md`、`stages.md`、`coverage.md`、`baseline.md`、`ledger.md`、
001–020、101–114、v2/v3 review；核对 Rust/WASM binding、React/UI-core API、demo、
Vite/Playwright、package/tsconfig/scripts 与当前 worktree。本次只新增本报告。

## 总结

v4 已把方向收敛到真正的最小 Rust vertical slice，且大部分 v3 结构问题已经修正；但当前仍有
三个会使实现编译失败、浏览器路由失败或 canonical mutation 失真的硬阻断，不能派发 001。

已确认成立：

- DAG 无环、无未知依赖；当前 waves 为 `001 → 002 → 003 → {004,005} → 006 →
  {007,008,009} → 010 → 011 → 012 → {013,014} → 015 → 016 → 017 → 018 →
  019 → 020 → {101,102,107} → 103 → 104 → 105 → 106 → 108 → 109 → 110 →
  111 → {112,113} → 114`。按 frontmatter exact files，没有同 ready-set 写/写重叠。
- 当前矩阵 C00–C07/C01 子行与 34 个叶子的 `coverage` 集合双向相等，0 漏行、0 孤儿；
  M0→S01 也已由 101/102/107 对 020 的依赖真实编码。
- v3 C1 的 generation context、seed-before-projection、partial-seed invalidate、`afterInit`
  ready transaction 与确定性 A1=42 已形成一条可实现主线。
- v3 C2 的 viewport `scrollTo/refresh` 断口已由 102→103 的 frozen handle 补齐；v3 C3
  已改为唯一调用 `runEditingCommitAtom/retryEditingRefreshAtom`，不再拼 `intent.request`。
- M0 只调用 lite `WasmWorkbook` 已存在的方法；`read_sparse_range`、`snapshotCell`、
  `bulk_import_cells` 与六个 fallible setter 均存在于
  `excel/excel-wasm/lite/einfach_wasm.d.ts:183-207,377-383,563-570,667-681`。
- 叶子普遍已拆到单一、targeted-test 的 10–20 分钟量级；v3 的 runtime/E2E 大叶已拆开，
  004/005、007/008/009、013/014、101/102/107 的验收读取面不再跨 sibling producer。
- Rust-only 禁止项、无 Static/TS fallback、S01 后 `awaiting_user` 与 S02 不提前展开均写成硬门。

## v3 findings 闭环表

| v3 finding | v4 状态 | 本审结论 |
|---|---|---|
| C1 seed 状态/事务/确定性数据 | 部分闭环 | generation 与 transaction 已闭；输入转换 owner 仍见 I2 |
| C2 viewport scroll/refresh | 主断口闭环 | controller/handle 可实现；cell DOM extension 仍见 I3 |
| C3 canonical editing command | 调用路径闭环 | 已用 async atom；Rust formula ACK 语义仍见 C1 |
| I1 exact 跨叶签名 | 部分闭环 | RPC/backend 大部已冻结；仍有未定义/未声明 symbol，见 I1 |
| I2 验收读写竞态 | 部分闭环 | producer waves 已修；112/113 的 server 竞态仍见 I4 |
| I3 三路由 E2E server | 未闭环 | config 写得更精确，但两个 HTML 的真实入口会 404，见 C2 |
| I4 叶粒度 | 闭环 | runtime/bootstrap/infra/browser/audit/spec/gate 已按职责拆分 |
| I5 coverage 角色/路径 | 机械闭环 | 双向集合正确；M0 public export 时序仍不成立，见 C3 |
| I6 baseline 可续跑 | 闭环 | baseline 已持久记录 `fc174dfc`；派发 base 的写入时点明确 |

## Critical（3）

### C1. formula parse/cycle 已修改 Rust，但任务要求按 reject 且不 bump revision

`RustFormulaResultWire` 只有模糊的 `ok`（`index.md:59-61,84,95`）；009 规定
`installed:false` 再读 snapshot，且明确它不是 engine refusal
（`009-cell-write-handler.md:29-32`）。但 014 又规定“formula reject”时 promise reject、零 revision
bump（`014-cell-input-backend-port.md:29-33`）。真实 binding 明确 `installed:false` 表示 parse/cycle
失败，**cell value 已经变成错误值**（`excel/excel-wasm/lite/einfach_wasm.d.ts:672-681`；Rust
实现见 `excel/rust/wasm/src/wasm_workbook_writes.rs:117-143`）。

影响：backend 可以向 `runEditingCommitAtom` 报 rejected、保留 draft、拒绝 refresh，同时 Rust 已改变
canonical workbook；revision/history/projection witness 全部失配。这不是可用 rejection，也无法靠 UI 修补。

可执行修订：把结果冻结为 applied/installed 判别联合，例如
`{ok:true;installed:true}` 与
`{ok:true;installed:false;code:'INVALID_FORMULA'|'FORMULA_CYCLE';message:string;display:string}`；真正
spill/invalid-address/custom-call refusal 继续走 RPC structured error。014 对两个 `ok:true` 分支都 ACK、
bump revision 并 refresh，只有 RPC refusal 才 reject。同步修改 index、003、009、014 的 exact tests。

### C2. 018 的 package-root Vite server 会让两个既有 route 都请求不存在的 `/main.tsx`

018 把 Vite root 冻结为 `react-excel` 包目录，并要求 `/e2e/fixture/`、`/demo/` 可达
（`018-e2e-infrastructure.md:31-41`），但其 `files` 不拥有两个既有 HTML。当前
`excel/react-excel/e2e/fixture/index.html:10` 与 `excel/react-excel/demo/index.html:11` 都写
`src="/main.tsx"`；切到包根后它解析为 `excel/react-excel/main.tsx`，该文件不存在。实测以包根启动
Vite 时两个 HTML 均返回 200，但 `GET /main.tsx` 返回 404，server 同时报
`Failed to load url /main.tsx`。multi-page `input` 不会改写 HTML 的绝对模块路径。

影响：018 的 adapter Chromium 验收、020 `build:e2e`、112/113 `/demo/` 全部在加载业务代码前失败。

可执行修订：018 增加两个 `index.html` 的 ownership，把 script 改为相对 `./main.tsx`（兼容 demo
自己的 `root: demo`），并让验收至少证明 `/e2e/fixture/main.tsx`、`/demo/main.tsx` 返回 200；
`build:e2e` 必须在 018 或紧随其后的 integration leaf 首次实际运行。

### C3. 019 要消费 React public default runtime，但该 export 要到 108 才生产

019 明确只从 public API 消费 `createDefaultRustWorkbookRuntime`
（`019-rust-browser-fixture-gate.md:30-33`）。017 只拥有两个 runtime 实现文件、package/tsconfig/lock，
不拥有 `src/index.ts`（`017-default-rust-bootstrap.md:16-23`）；当前 root barrel
`excel/react-excel/src/index.ts:1-53` 也没有该 export。唯一 root-export 叶是 108，而 DAG 是
`019 → 020 → ... → 108`（`108-react-public-exports.md:6,16-19`）。coverage 也把 C01g export 写成
015/108、audit 写 019（`coverage.md:79`），时序自相矛盾。

影响：019 若守 public-only 会 typecheck/build 失败；若 deep-import 则违反任务和后续 package gate。

可执行修订：让 017 同时拥有 `src/index.ts` 与 `test/package-entry.test.ts`，发布 runtime store/hook、
default factory 与 types，验 root import 零 Worker side effect；108 在 020 之后保留这些 export 再追加
S01 surface。若坚持独立职责，可在 017→018 之间新增一个 M0 public-export leaf，效果相同。

## Important（4）

### I1. v3 I1 仍有三个跨叶 symbol 没有完整可复制签名

- `RustWorkerSheet` 被 options/session/backend 四处引用，却在整棵树中没有定义
  （`index.md:125-140`）。custom `id` 如何映射 wire `index/name` 因而仍靠 agent 猜。
- 016 生产 `useRustWorkbookRuntime(runtime)`（`016-react-runtime-store.md:25-32`），index 的 frozen
  React contract 只声明 factory/store（`index.md:147-158`）；101 还误写成消费“task 015 hook”
  （`101-workspace-state-surface.md:29-33`）。
- `RuntimeWorkbookContext.initialize` 是同步返回（`index.md:109-119`），而 006 要在 async WASM init
  后才 initialize，却没有冻结 `createRuntimeWorkbookContext` 是 Promise 还是同步 factory
  （`006-runtime-generation-context.md:28-32`）；011 作为消费者也没有原样调用签名。

修订：在 index/producer/consumer 同步加入例如
`RustWorkerSheet {id:string;index:number;name:string}`、
`useRustWorkbookRuntime(runtime: RustWorkbookRuntime): RustWorkbookRuntimeState`、
`createRuntimeWorkbookContext(wasm: RustWasmModule): Promise<RuntimeWorkbookContext>`；011 明写 await，
101 改为消费 016，并冻结 `SpreadsheetWorkspaceBoundary` 的 ready-child props。

### I2. 009 的“唯一输入转换器”没有真实 consumer/export owner

009 导出 `toImportCellWire`（`009-cell-write-handler.md:29-32`）；010 只声称 payload 已由它产生，代码
并不调用它（`010-demo-seed-handler.md:28-32`）。015 的 root export 清单也不含该 symbol
（`015-exact-backend-surface.md:30-34`），所以 017 的 React seed generator 无法从 public neutral package
消费它；014 又只写“相同规则”，没有逐名 import（`014-cell-input-backend-port.md:29-32`）。

修订：把 converter/分类器放到 neutral package 的单一低层模块；009、014 逐名消费，015 root export，
017 generator 从 package root 消费。003/009/014/017 分别断言同一组 empty/formula/finite-number/
boolean/text vectors，禁止复制 parser。

### I3. 104 无法在现有 files/API 内把 id 安到真实 active `<td>`

104 要求 active cell id 与 grid `aria-activedescendant`（`104-selection-grid-wrapper.md:29-38`），但只拥有
新 selection wrapper。真实 `SpreadsheetGridViewProps` 只有 window/cells/selected
（`excel/react-excel/src/SpreadsheetGridView.tsx:199-204`），实际 `<td>` 没有 id extension point
（`:216-237`）；103 也不产出 cell-props callback（`103-viewport-grid-wrapper.md:29-36`）。按当前边界只能
imperative DOM mutation 或伪造隐藏 descendant。

修订：冻结 renderer extension（例如 `getCellId(row,col)`/`getCellProps`），把
`SpreadsheetGridView.tsx`、`SpreadsheetViewportGrid.tsx` 及就近旧测试加入 104（与 103 串行安全），
让 104 通过 props 给真实 active `<td>` 赋 id；测试断言 referenced element 就是对应 data-cell。

### I4. 112/113 会并发争用固定 E2E server，且 113/114 没有可复制完整命令

112 与 113 同依赖 111，会同 wave 派发（各自 `:6`）。二者运行 Playwright 时都使用 018 冻结的
`127.0.0.1:5182 --strictPort`（`018-e2e-infrastructure.md:33-36`），还共享默认 output 目录；并发时至少
一个 webServer 会端口失败。113 只写“四 project”而没有命令/project 名
（`113-failure-layout-e2e.md:30-33`），114 又引用不存在于自身文档的“112/113四project命令”
（`114-s01-acceptance-gate.md:26-30`）；agent 按规则只读自己任务与 index，不能复制执行。

修订：令 113 `depends_on: ["112"]`（或冻结不同 port/outputDir）；在 113 与 114 原样写出两个 spec 的
完整 `--list`/run 命令与四个 project 名。018 明确 browser-install prerequisite，114 的固定命令集不得靠
读取 sibling task 补全。

## Minor（0）

无。其余风险已被现有 targeted tests、M0 browser gate、bundle/dependency audit 与 S01 四 project gate
合理覆盖。先按 C1→C3、I1→I4 修订，再作一次静态复审；在 Critical 清零前不要派发 001。
