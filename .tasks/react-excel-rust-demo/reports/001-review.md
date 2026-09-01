# APPROVED

复核日期：2026-09-01

复核基准：`c63249171a177cb39c0755cc14db66f9caa4f2b7`

复核范围：完整阅读 `index.md`、`001-open-rust-workbook.md`、
`reports/001-report.md`；核对 base 到当前工作树的全部 tracked diff 与未跟踪文件；
静态追踪现有 Rust worker runtime、worker protocol、import session、neutral backend 与
App 生命周期实现。按要求未重跑执行报告中已经运行的 Jest、typecheck、build、扫描、
preview 或 `git diff --check` 命令。

## Findings

### Critical

无。

### Important

无。

### Minor

#### App 生命周期边界缺少定向自动化测试

当前唯一新增测试 `rust-demo-backend.test.ts` 覆盖 package export、8,008 cells、累计
normalized 数与失败 commit stats，但没有渲染 `App` 来固定同步构造失败、ready reject、
StrictMode 双 effect、卸载后的 late completion 与 dispose 次数。源码静态审查没有发现
这些路径的实现错误，执行报告也给出真实 ready preview，因此此项不阻塞 001；它只是
后续改动可能使生命周期语义回归而不被当前单测捕获的残余风险。

## 验收核对

### 1. Rust-only 依赖边界：通过

- `rust-demo-backend.ts:1-2` 只从
  `@einfach/solid-excel/worker-backend` 导入现有 neutral backend，并 direct import
  `@einfach/solid-excel/vnext-worker-runtime?worker`；factory 精确为
  `() => new RustWorkbookWorker()`。
- demo diff 没有引入 `worker-factory`、`defaultExcelCoreTsWorkerFactory`、
  `worker-runtime-ts`、`worker-entry-ts` 或 `@einfach/excel-core-ts`。
- 已生成的 `dist` 中现有 worker JS 与 WASM asset 均存在；对现有产物的只读核对未见
  Solid runtime/UI 或 TS fallback token。主线程 bundle 中可定位 neutral backend，worker
  bundle 来自 Rust/WASM runtime；没有静态数据 fallback 分支。

### 2. package export 与 lock：通过

- `solid-excel/package.json:45-50` 只新增 `./worker-backend`，四个 condition 精确落到
  已存在的 `src/adapter/worker/backend.ts`、声明产物与 ESM 产物；没有修改 backend 实现。
- `react-excel/package.json:20-24` 声明 workspace 依赖，`pnpm-lock.yaml` 仅在对应 importer
  增加 `workspace:* -> link:../solid-excel`，manifest 与 lock 一致。

### 3. direct import、8,008 cells 与 stats：通过

- seed 常量为 `(1_000 + 1) * 8 = 8_008`；表头 8 格，1,000 个数据行各 8 格，最后一格
  到 row `1_000` / col `7`。默认 chunk size 为 500，传给 worker 的每个 chunk 有界。
- `beginImport({ mode: 'direct' })` 后，每次 `importChunk` 都把返回值与本地累计输入数比较。
  这与现有 Rust runtime 的语义一致：session 的 `normalizedCount` 在每个 chunk 后累加并
  返回，而不是返回单 chunk 数。
- `commitImport` 后要求 `accepted === 8_008`、`errors === 0`、
  `rejectedFormulas === 0`；Rust bulk import 会把成功公式计入 accepted，因此断言与 seed
  的 1,000 个公式兼容。
- commit 前任一步失败或 commit reject 时，`committed` 仍为 false，会 best-effort
  `cancelImport` 后重抛原错误。commit 已返回 stats 后 session 已由 runtime 删除，代码先把
  `committed` 设为 true，再校验失败 stats，正确地不对已消费 session 发无意义 cancel。
  direct mode 可能已有部分写入，但随后 backend ready reject，App dispose 整个 worker，
  不会把部分工作簿展示为 ready。

### 4. App 状态与生命周期：通过

- 初始只渲染 loading；backend ready resolve 后才挂载 provider/workbook 并显示
  `Rust/WASM ready`；同步构造异常与 ready reject 都进入 error，均无静态 fallback。
- ready reject 先 dispose backend；正常卸载 cleanup 也 dispose。backend 与 client 的
  现有 dispose 均有幂等 guard，因此 rejection 与 cleanup 的重复清理安全。
- demo 入口启用 React StrictMode。第一次 effect 的 cleanup 会把该闭包的 `active` 设为
  false 并 dispose 第一 backend；其 late resolve/reject 不会更新第二次 effect 的 state。
  卸载后的 late completion 同样被 `active` 阻止，未见 stale ready/error 写回。
- 同步 worker constructor 失败时尚无可释放 backend，catch 会稳定显示 error；实际
  backend 创建成功后的异步初始化失败则由 rejection 路径负责 dispose。

### 5. 文件边界、行数与写集：通过

- 执行报告记录 App 139、backend 85、seed 71、test 87 行，均 `<=300`；本审查未重复
  `wc -l`。职责可分别描述为 demo 组合入口、Rust demo backend bootstrap、seed 生成、
  backend bootstrap 测试，没有 `utils`/`partN` 假拆分。
- 任务产品写集完整覆盖当前 001 的四个 modified 产品文件与三个 untracked 产品/测试
  文件；report 也在白名单。`index.md` 与任务文件相对 base 的 `running/base` 更新是
  编排者账本变更，执行报告明确未冒领；未发现其他未跟踪产品文件或越界修改。

## 结论

001 的实现合同与验收证据成立；无 Critical 或 Important finding。结论：APPROVED。
