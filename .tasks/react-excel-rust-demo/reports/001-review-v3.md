# APPROVED

复核日期：2026-09-01

复核基准：`c63249171a177cb39c0755cc14db66f9caa4f2b7`

复核范围：完整阅读 `001-open-rust-workbook.md`、`index.md` 与
`reports/001-report.md`；按任务 `files` 核对 base 到当前工作树的范围 diff，并只读检查
根 TypeScript/Jest 配置。未重跑报告已经执行的 ESLint、Jest、demo typecheck、根级
`tsc -b`、build、bundle scan、preview 或其他验收命令；未修改产品、任务状态或 index。

## Findings

### Critical

无。

### Important

无。

### Minor

- App 的 StrictMode、卸载后 late completion 与 dispose 次数仍没有定向渲染测试；该残余
  风险已由编排者记入 `index.md`。现有生命周期源码、真实 ready preview 与前两轮独立
  静态审查均未发现实现错误，不阻塞 001。

## 最终复核

### 最新测试加载边界：通过

- `rust-demo-backend.test.ts` 不再静态 import 或 type-only import
  `@einfach/solid-excel/worker-backend` 与 `../demo/rust-demo-backend`。文件顶部只静态读取
  package JSON 和不含 worker/backend 依赖的 seed 常量。
- virtual `@einfach/solid-excel/vnext-worker-runtime?worker` mock 在两个
  `jest.requireActual` 之前注册。随后才用字符串加载真实 package backend subpath，再加载
  demo backend，因此 demo backend 求值时看到的是已注册的 worker mock；没有
  mock-before-load 时序回归。
- 测试本地 `ImportRustDemoWorkbook` 只描述本测试实际提供的 client 最小形状。它用于
  `requireActual` 结果断言，不产生 import，也不改变运行时。行为断言仍覆盖 direct mode、
  累计 normalized count、8,008 cells、bounded chunks、commit 与失败 stats。

### 真实 package subpath：通过

- 测试仍直接读取 `solid-excel/package.json`，精确断言 `./worker-backend` 的 `solid`、
  `types`、`import`、`default` 四个目标。
- 它还以真实 specifier
  `jest.requireActual('@einfach/solid-excel/worker-backend')` 解析 package subpath，并断言
  `createWorkerWorkbookSpreadsheetBackend` 是函数。因此不只是检查 JSON 文本，也验证当前
  Jest/workspace 消费环境可实际解析该公开入口。
- manifest diff 只新增这一 export；四个目标文件均为既有 neutral backend 产物。demo
  产品代码继续只从该 subpath 导入 backend，并 direct import Rust runtime，没有经过
  Solid public barrel、worker factory 或 TS fallback。

### 根级 TypeScript 修复：通过

- 根 `tsconfig.json` 的 include 覆盖 `./**/*.test.ts(x)`，使用
  `moduleResolution: "Node"`，并排除 `excel/solid-excel/**` 的发现扫描。即使写成静态
  type-only import，被引用的 demo backend 仍会被加入根 program；该模块再 import Vite
  专属 `?worker` specifier，突破根测试工程与 demo bundler 工程的边界。
- 当前修复没有修改根 tsconfig、添加宽泛 path alias、跳过检查或污染产品 API，而是让
  Jest 测试按本来就需要的 mock 时序动态加载 Vite 边界模块。根级 `tsc -b` 因而只检查
  测试本地契约与安全静态依赖；demo 自身仍由独立的 Bundler-resolution
  `typecheck:demo` 覆盖。该分工合理。
- 报告记录修复后定向 ESLint、Jest 3/3、demo typecheck 与根级
  `pnpm exec tsc -b --pretty false` 均通过；本复核未重复运行。

### package、lock、范围与文件规则：通过

- `react-excel/package.json` 新增 `@einfach/solid-excel: workspace:*`，lock importer 精确
  对应 `link:../solid-excel`；没有额外 package/lock 漂移。
- 按 task `files` 的 base 范围 diff 只包含声明的三个 manifest/lock 文件、App、backend、
  seed、test 与执行报告；未见根 tsconfig/Jest 配置或其他产品文件被顺手修改。
- 报告记录 App 139、backend 85、seed 71、test 103 个物理行，全部 `<=300`；当前 diff
  行数与记录一致。App 负责 demo 组合与生命周期，backend 负责 Rust demo bootstrap，
  seed 负责导入数据生成，test 负责 bootstrap 合同验证，均可用单一职责描述，无
  `utils`/`partN` 假拆分。

## 结论

最新测试修复保持 mock-before-requireActual，既避免根 TypeScript 静态拉入 Vite worker
模块，又继续验证真实 package subpath；任务范围、证据、行数与职责均成立。无 Critical
或 Important finding，结论：APPROVED。
