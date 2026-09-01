# React Excel · Rust/WASM 任务树 v3 独立终审

结论：NEEDS_CHANGES

审查日期：2026-09-01  
范围：完整读取 `index.md`、`stages.md`、`coverage.md`、`ledger.md`、`baseline.md`、
当前 001–016/101–110 全部 26 个叶子与 v2 review；核对当前 Rust/WASM binding、
React/UI-core API、demo、Vite、Playwright、tsconfig、package/workspace conventions 与 dirty worktree。
本次只新增本报告，没有修改任务文档或产品。

## 已确认成立

- 当前 26 叶 DAG 无环、无未知依赖；按全部同波完成重算的 waves 为
  `001 → 002 → 003 → {004,005} → {006,007,008,009} → {010,011} →
  {012,013} → 014 → 015 → 016 → {101,102,105} → 103 → 104 → 106 →
  {107,108} → 109 → 110`。初始 ready-set 只有 001。
- 仅按 frontmatter `files` 做 exact-path 检查，所有 ready-set 均无写/写重叠；
  `002 → 014 → 015 → 016` 和 107/108/109 的 metadata/demo 写面也已串行或拆开。
- v3 不再迁移 Solid 的 128 文件 adapter 闭包，M0 的 Rust-only 最小面方向正确。
  当前 lite binding 确实具有 `WasmWorkbook`、`bulk_import_cells`、
  `read_sparse_range`、sheet API、`snapshotCell` 与全部 fallible setters
  (`excel/excel-wasm/lite/einfach_wasm.d.ts:183-207,383,563-570,667-681`)；
  `@einfach/excel-wasm` root 也确实指向 lite 产物。
- 1000×8 等于 8,000，低于任务自定 10,000 上限；Rust 的 import wire 确实是
  `{sheet,row,col,kind,value}`，并返回 accepted/formulas/rejectedFormulas/errors/issues
  (`excel/rust/wasm/src/wasm_import_cells_wire.rs:1-30`)。
- current coverage 的 15 行与 26 个叶子的 `coverage` frontmatter 做机械双向集合比较为
  0 mismatch；v2 的“完全没有 leaf owner”已修复。
- `baseline.md` 中四个已跟踪 dirty 文件的 sha256 与当前磁盘完全相等，HEAD 仍为
  `f4989f5631044b415920aa706bd8cad2e2c0de96`。

## Critical（3）

### C1. seed 的跨 handler 状态、转换 owner 与 ready 事务没有可实现合同

证据：009 只依赖 005，却明确要求“转换规则与 task 008 一致”，并要求同时观察
“workbook ready 之后、首次 projection 之前、仅一次、失败后 retry 新 workbook”
(`009-demo-seed-command.md:6,31-39`)。008 与 009 实际处于同一 ready wave，转换唯一实现
`cell-input-wire.ts` 又由 008 独占 (`008-cell-write-commands.md:16-19,31-34`)；因此 009
要么在 008 完成前导入不存在的模块，要么复制转换规则。

更关键的是，006 才知道 init，007 才知道首次 projection，009 的文件面却只有 seed handler/wire/test，
005 只承诺 bind/init/replace/current workbook，没有 generation/initialized/seeded/projected 状态
(`005-wasm-host-surface.md:32-36`)。Rust `bulk_import_cells` 不是“遇到一项错误则全批不写”：它逐项写入并累计
accepted/issues (`excel/rust/wasm/src/wasm_workbook_import.rs:13-41,53-71,102-138`)；所以 009 所称失败后
ready 失败，必须靠明确的 generation discard 才安全。当前 015 又写成“await backend ready 后再 seed”
(`015-react-rust-runtime.md:48-50`)，与 009 的“失败不宣称 backend ready”和 011 已提供的
`afterInit` gate (`011-backend-session-gate.md:33-41`)不一致。最后，016 要验 A1 formula，
但 015 只规定 8,000 个输入，未冻结任何一格的值/公式，浏览器断言没有 producer。

影响：minimal vertical slice 无法由独立 agent 按 DAG 实现；即使 8,000 accepted 测试通过，
“只 seed 一次/首次读取前/失败不暴露部分数据/retry 重建/A1 formula”仍可能全部失真。

精确修订：

1. 新增或前移唯一 `RuntimeWorkbookSessionState` 合同，至少含 generation、initialized、seeded、
   projectionStarted；006/007/009 的 handler 接受同一个显式 context，不用 module-global 猜测。
2. 让 009 依赖 008，并逐名消费一个冻结签名，例如
   `toImportCellWire(sheet,row,col,input): RustImportCellWire`；或把这项共享转换抽成 008/009 之前的独立叶。
3. seed 必须进入 011 的 `afterInit`/等价 ready transaction；任何 issue 都丢弃该 worker/workbook generation，
   backend/runtime ready promise 必须拒绝，retry 只使用新 generation。
4. 写出 1000×8 的确定性坐标和值合同，明确 A1 的 formula/source/display；若 A1 不应是公式，修改 016 的断言坐标。

### C2. 102→103→104 没有 scroll/visible-window/refresh 组合接口，wrapper 链无法闭环

证据：102 冻结的 props 只有 sheetId/dimensions/size/overscan，并把 `useSpreadsheetViewport`
结果直接交给 `SpreadsheetGridView` (`102-visible-window-grid-wrapper.md:31-38`)；没有 ref/controller、
当前 window callback、`scrollToCell` 或 `refreshProjection` 输出。103 却要求远距键盘导航“委托 viewport
scrollTo”，同时禁止修改 root hooks (`103-selection-grid-wrapper.md:31-39`)；104 又要求 ACK 后刷新
“当前 visible window”，文件面只允许新增 editing wrapper (`104-rust-editing-wrapper.md:31-40`)。

当前真实 API 证实这个断口：`useSpreadsheetViewport` 的 `scrollTo` 只返回给直接调用它的组件，返回类型没有
refresh (`excel/react-excel/src/use-spreadsheet-viewport.ts:34-44`)；projection transport 是该文件私有函数
(`:129-162`)，effect 也只随 sheet/window/maxCells 变化重跑 (`:207-222`)。现有
`SpreadsheetGridViewProps` 只有 window/cells/selected (`SpreadsheetGridView.tsx:199-204`)，也没有
imperative surface。103/104 若不越界修改 102/root，只能 DOM query、remount 或复制私有 transport，均违反
wrapper-only/唯一算法真相。

影响：远距键盘滚动、active descendant/overlay、Rust ACK 后 canonical refresh 三项不能同时按 files 与
“不复制算法”约束实现；S01 edit E2E 即使能点按钮，也不能证明真实 viewport 被刷新。

精确修订：在 102 产出、103/104 明确消费一个唯一 controller/ref（给完整签名），至少包含当前
`window/cells/status`、`scrollToCell(row,col)` 与 `refresh(): Promise<void>`；refresh 内部复用同一
latest-only transport。更稳妥的拆法是先开一个 React projection-controller 叶，合法修改/拆出当前
`use-spreadsheet-viewport.ts` 的 transport，再让 102–104 只组合它。同步规定 selection bounds、cell id/
coordinate 与 overlay placement，禁止后续叶靠 DOM mutation 补接口。

### C3. 104 调用不存在的 `intent.request`，会绕过现有 canonical editing command

证据：104 明写 `provider backend setCellInput(intent.request)`
(`104-rust-editing-wrapper.md:31-39`)。当前 `useSpreadsheetEditing.commit` 返回
`EditingCommitIntent | null` (`excel/react-excel/src/use-spreadsheet-editing.ts:19-27,60-63`)；真实
`EditingCommitIntent` 只有 sheetId/cell/source/input/move，根本没有 `request`
(`excel/spreadsheet-ui-core/src/editing/types.ts:41-54`)。

当前 UI-core 已有且必须复用的 async truth 是 `runEditingCommitAtom`。它自己分配 requestId、通过 mutation
gateway、冻结 ticket (`excel/spreadsheet-ui-core/src/editing/index.ts:813-877,930-945`)，并要求
`source`、`refreshProjection`、`historyEntryRecorder` (`editing/types.ts:105-116`)；ACK 后还会严格记录
revision/history 并进入 refreshing/rejected/outcome-unknown 生命周期 (`editing/index.ts:1093-1176`)。
普通 `commitEditingAtom` 旁边甚至明确标为 legacy intent command，只 staging、不完成 session (`:803-811`)。

影响：照任务文字实现会出现编译错误；若 agent 自行拼 request，则会绕过 request correlation、history
reservation、mutation gate、ACK validation 与 refresh-failed/outcome-unknown，违反“现有 editing 模块为唯一算法真相”。

精确修订：104 必须逐名调用 `store.setter(runEditingCommitAtom, { source: backend,
refreshProjection, historyEntryRecorder, ... })`，并定义 recorder 的唯一 owner、lifecycle/error/retry UI 与
task 013 的严格 ACK（editing 路径 requestId/revision 必填）。若不希望组件直接操作 atom，先开独立叶扩展
`use-spreadsheet-editing.ts` 为 async controller；104 只消费该 public hook。不得保留直接调用
`intent.request` 的方案。

## Important（6）

### I1. RPC/WASM/backend/React 跨叶仍只有名词，没有可复制签名

003 列八个 command 名，却没有逐 command request/result 与八个 client method 签名
(`003-minimal-rpc-wire.md:31-39`)；005 只说 host“提供 bind/init/replace/current”，没有导出名和 async
签名；010 也没有定义 handler 是 sync/async、参数/context/reply ownership
(`010-rust-dispatcher-factory.md:31-36`)。011 的 `client?`/`workerFactory?` precedence、`ready/sheets/dispose`
类型、`afterInit` 签名未给出 (`011-backend-session-gate.md:31-41`)；015 的 public factory 名/注入 options
也未出现在合同 code block。执行 agent 又被 index 限定只读自己任务与 index，无法靠相邻任务补上下文。

修订：每个 producer 写完整 exported symbol/signature；每个 consumer 原样列 import 与调用。至少冻结
`RustCommandHandler`、八组 payload/result、`WorkerWorkbookClient`、host/session/backend options、
`createRustWorkbookRuntime(options?)`。private source package还需明确 worker/React project reference；当前 React
`tsconfig.json:4-11` 是 `rootDir: src` 且 `references: []`，015 应直接验 package typecheck，不只验 demo。

### I2. 无 exact 写冲突，但 ready-set 的全项目 typecheck/build 存在读/写竞态

004 与 005 同 wave，二者都运行整个 `excel-worker` tsconfig
(`004-rpc-client-lifecycle.md:37-39`; `005-wasm-host-surface.md:40-42`)；任一可在另一方文件写到一半时读到它。
010 与 011 同 wave，010 又对包含 011 新 backend 文件的整个包跑 tsc
(`010-rust-dispatcher-factory.md:38-42`)。107 与 108 同 wave，而 108 的 `build:demo/typecheck:demo`
会编译 107 正在改的 DemoGrid/FormulaBar/Footer (`108-demo-univer-shell.md:39-43`)；当前 App 明确 import 并调用
这些组件 (`excel/react-excel/demo/App.tsx:10-20,60-72`)，真正更新 App 却要等 109。

修订：叶内只跑不跨 sibling 写面的 targeted test；把全包 tsc 移到所有相关 producer 之后的 integration gate，
或加真实依赖边。demo 侧让 108 在 107 前完成旧 shell build，或让 107 保持 App-compatible props；最终全 demo
build 由 109/110 运行。调度审计应同时检查“验收命令读取面”，不能只比 `files`。

### I3. 016 尚未冻结三路由 E2E server 的可达配置

016 已补 `e2e/vite.config.ts` owner，这是进步；但只说“一台 server 同时服务三个路径”，未写 Vite `root`、
Playwright `webServer.command/url`、project `baseURL` 或健康检查路径 (`016-rust-browser-gate.md:36-48`)。
当前配置仍把 Vite root 固定为 `e2e/fixture`、testDir 固定为 adapter-selection，并探测 bare base URL
(`excel/react-excel/playwright.config.ts:21-31,35-58`)；demo 自己另以 `root: demo` 服务
(`demo/vite.config.ts:4-18`)。把 testDir 改成 `./e2e` 并不会自动让 `/demo/` 和两套 fixture 可达。

修订：在 016 直接给出可复制配置：Vite root 为 `react-excel` package directory，webServer command 显式使用
`e2e/vite.config.ts --strictPort`，health URL 指向一个保证 2xx 的具体 fixture 路径；四 project 分别冻结
browserName/device/390×844/baseURL。写出 `verify` 的精确 script chain，并让 `--list` 同时证明 runtime spec 与
adapter-selection spec discovery。

### I4. 015/016/110 的 10–20 分钟声明与职责边界不可信

016 一个叶同时改 10 个产品/config 文件，负责 package scripts、两浏览器四 project、三路由 Vite server、
fixture UI/spec、console helper、旧 spec 迁移与 dependency-cruiser，并要求实际四项目运行；这不是
15–20 分钟单一交付 (`016-rust-browser-gate.md:16-27,32-48`)。015 同时承担 lifecycle store、hook、
8,000-cell 数据生成、worker/backend bootstrap、package/tsconfig/lock 与复杂 ABA/StrictMode 测试
(`015-react-rust-runtime.md:29-56`)。110 又把 1000-row virtual scroll、selection、edit、failure/retry、
desktop/mobile layout、console 与 screenshots 塞入一个四浏览器 spec。

修订：015 至少拆 lifecycle store/hook 与 seed/bootstrap；016 拆 E2E infrastructure/project matrix、Rust fixture
browser gate、dependency/bundle audit；110 按可独立否决场景拆 core interaction 与 failure/layout audit，保留一个
只汇总证据的最终 gate。拆后每个新测试文件同样受 300 行硬规则，不把场景堆进单个大 spec。

### I5. coverage 机械双向通过，但角色与精确路径不真实

矩阵声明 producer“只产生合同/组件” (`coverage.md:64-68`)，但 C03/C04/C05/C07 的精确路径都是 demo
Header/Ribbon/FormulaBar/Footer，却把只写 `src/design/**` 的 105 标成 producer、只写 React root barrel 的 106
标成 export (`coverage.md:78-84`)。实际写这些 demo 文件的是 107/108；demo 私有组件也不会被 106 root export。
C01d/e 的精确路径只写 runtime command，却又把 backend port 012/013 混在同一 producer 行。

修订：C03/C04 producer 改 108，C05/C07 producer 改 107；private demo surface 的 export 写明确 `N/A`，
或另开 public primitive 行让 105/106 负责。C01d/e 拆成 RPC producer 与 backend adapter/export 两行。
随后继续保持目前已经通过的 row↔frontmatter 双向集合检查。

### I6. dirty tracked hashes有效，但 untracked demo baseline 仍不可续跑

`baseline.md:8-11` 的四个 tracked hash 当前均匹配；但整个 untracked demo 只记
`dir:react-demo`，把逐文件 hash 指向“v2 reviewer 消息” (`baseline.md:12`)。这违反任务树“压缩后只信磁盘文档”原则，
而 107–109 正要原地修改这些文件。所有叶与 ledger 目前也仍是 `base: null`。

修订：派发前把 demo 每个文件的 status+sha256 或完整 pre-task patch 持久写入 `baseline.md`；或者在得到明确
提交授权后把 baseline 作为独立 commit 固化。随后复核 worktree、把新 HEAD/pre-task workspace hash 写入每叶和
ledger，再允许 001 ready。不得只依赖聊天消息或 HEAD→post diff。

## Minor（0）

无。其余方向性设计（Rust-only boundary、private source package、exact narrow backend、渐进展开 S02–S16）
可以保留；先修上述 Critical 与 Important 后再作 v4 静态复审。

