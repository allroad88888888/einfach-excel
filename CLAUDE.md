# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

浏览器表格栈（einfach-excel）。**当前唯一产品主线**：

```
excel/react-excel  →  @einfach-excel/spreadsheet-ui-core  →  Rust Worker / @einfach-excel/excel-wasm  →  einfach-excel-core (Rust)
```

**产品目标是单用户、可嵌入宿主的本地表格组件，不是在线协作表格。** 多人协作、身份与通知、
更改记录（Show Changes）、版本历史、个人视图（Sheet Views）、自动保存与服务端持久化**全部暂停**：
不要为它们设计服务端契约、预留接口或补占位实现。批注/备注只做工作簿本地数据。

状态管理由上游 einfach（Jotai 风格 atom 引擎）提供：`@einfach/core` 与 `@einfach/react` 从 npm
消费（当前基线 `^0.4.0`），源码不在本仓，Vitest 也不做 alias —— 本仓必须跑在**已发布**的 core 上
（[ADR 0002](docs/decisions/0002-upstream-core-via-npm.md)）。本仓 2026-07-29 从
`allroad88888888/einfach` 拆出；原仓残留的 `excel/` 是冻结副本，不要在那边改。

## Commands

开发要求 Node.js >= 22.19、pnpm 10、Rust + `wasm32-unknown-unknown` + `wasm-pack`
（已构建包的消费者基线是 Node >= 22.12，[ADR 0018](docs/decisions/0018-node-baseline-22-12.md)）。

```bash
pnpm install && npm run ensureWasm              # 缺 excel/excel-wasm/lite 时调 wasm-pack
pnpm --filter @einfach-excel/react-excel dev           # React 演示（Vite）；?renderer=canvas 切 Canvas 单元格

npm run build            # clearTypes → ensureWasm → check:presentation → tsc → rollup → react-excel build
npm test                 # 根 Vitest projects：canvas / react-cells / canvas-cells / excel-core-ts / ui-core / react-excel
pnpm --filter @einfach-excel/react-excel exec vitest run path/to/file.test.ts
pnpm --filter @einfach-excel/spreadsheet-ui-core test

npm run check:presentation   # 展现层机械边界门禁（见下文 React 规则）
npm run check:e2e-features   # e2e/FEATURES.md 登记与用例绑定
npm run typecheck:mainline   # ui-core tsc -build + react-excel typecheck
npm run lint:check           # eslint 只检查；npm run eslint 检查并自动修
npm run check:docs           # 文档链接门禁（CONTRIBUTING §文档规则）
npm run check:cycles         # dependency-cruiser 循环依赖

# e2e（Playwright，真实 Worker/WASM；按功能目录组织，FEATURES.md 是功能登记权威）
pnpm --filter @einfach-excel/react-excel e2e:install
pnpm --filter @einfach-excel/react-excel e2e                     # 先跑 check:e2e-features + package:prepare
pnpm --filter @einfach-excel/react-excel e2e -- e2e/editing/     # 只跑一个功能目录
pnpm --filter @einfach-excel/react-excel e2e:package             # 打包后的仓外 Vite/Rspack 消费者验收

pnpm --filter @einfach-excel/react-excel i18n:extract            # Lingui；CI 会跑 extract + compile --strict

# Rust 引擎（各 crate 独立，无 workspace 根 Cargo.toml）
cd excel/rust/excel-core && cargo test                     # 另有 --no-default-features（lite）变体
cd excel/rust/excel-core && cargo bench                    # 口径见 excel/rust/docs/PERF.md
npm run clean:rust       # 删各 crate 的 target/debug（cargo 不自动回收）；post-commit 在超 20 GiB 时后台自动跑

# 改了 excel/rust/ 后刷新 WASM 产物
npm run build:wasm -w @einfach-excel/excel-wasm        # → excel/excel-wasm/lite/
npm run build:wasm:full -w @einfach-excel/excel-wasm   # --features regex-formulas → full/；完整 Vitest 的原生目录测试需要它
```

pre-commit（husky）：改到 WASM 导出时先跑 `wasm_public_api_signatures_unchanged`，再依次跑
check:docs、check:presentation、lint:check、typecheck:mainline、`vitest run --changed`。
全量 build + Vitest、四分片浏览器回归和 Rust 测试在 CI（`.github/workflows/ci.yml`）；完整 e2e
约 1.5 小时，大改动提交前自己跑一次全量 `npm test` 可以省一轮 CI 返工。

## Monorepo Structure (pnpm workspaces: `excel/*`, `packages/*`)

| 目录 | 状态 | 职责 |
|---|---|---|
| `excel/react-excel` | **主线** | 可嵌入的 React 工作簿组件包 + Vite 演示 |
| `excel/spreadsheet-ui-core` | 主线 | 框架无关的 UI atom、Rust 命令、Worker 传输 |
| `excel/rust/excel-core` | 主线 | Rust 工作簿 / 公式引擎（唯一事实源） |
| `excel/rust/wasm` + `excel/excel-wasm` | 主线 | WASM 绑定；产物以 lite/full 双入口单包分发（[ADR 0015](docs/decisions/0015-wasm-distribution-single-package.md)） |
| `packages/react-cells` | 主线 | 从 react-excel 提取的 DOM 单元格渲染 |
| `packages/canvas` / `canvas-cells` | 主线 | Canvas cell 生命周期 / 工作簿的 Canvas 单元格渲染器 |
| `packages/canvas-demo` | 演示 | Canvas 基础包的独立 demo |
| `excel/spreadsheet-ui-styles` | 维护中 | 跨框架表格视觉样式 |
| `excel/excel-core-ts` | 参照实现 | TS parity 参照，**不接入** React 运行时 |
| `excel/rust/core` | 维护中 | Rust atom store（TS core 的孪生实现） |
| `excel/vue-excel` | 独立实验 | 不参与主线门禁 |
| `excel/solid-excel`、`excel/excel-site` | **已暂停** | 仅留源码考古；不进默认构建/测试/CI/发布，也不是 React 改动的兼容目标 |

依赖方向：`react-excel → react-cells / canvas-cells → spreadsheet-ui-core`；`canvas-cells → canvas`。

## Architecture

仓库级地图在 `docs/ARCHITECTURE.md`，React 侧规则在 `excel/react-excel/SKILL.md`（动 React/UI Core
前必读，功能批次另读 `excel/react-excel/skills/react-excel-feature-wave/SKILL.md`）。

### 一条链

```
DOM 事件 → 一个 UI Core command atom → 一次 Rust 请求 → 发布结果 → React 重渲染
```

- **Rust/WASM**：单元格值、公式、依赖图、计算、事务、mutation 结果。
- **spreadsheet-ui-core**：选区、编辑草稿、视口、投影快照、命令生命周期和 feature 状态。
- **react-excel**：DOM、事件、焦点、pointer capture、滚动、测量、挂载与产品启动。
- **rust-worker**：只做请求/响应关联、错误传播和释放，不认识表格业务。

不要为假想的第二实现加 backend、adapter、bridge、port、lifecycle、retry 层。抽象只能由当前的
失败模式或当前的第二实现来证明。

### 连接与命令

旧的 `SpreadsheetBackend` 能力大对象和双后端 parity **已废弃**，不要恢复。一个 store 只绑定一个
`RustWorkbookConnection`（`rustWorkbookConnectionAtom`），只有 `request` 和 `dispose` 两个传输操作。
新增功能 = 新增一条明确的 Rust 命令 + 对应 command atom，不往连接上堆可选方法，也不在主线程镜像
工作簿状态或 Rust 能力。

- `src/rust-workbook/`：UI 形状的类型化 Rust 工作簿命令及 Worker 端执行。
- `src/rust-worker/`：纯 Worker RPC（`rust-worker-boundary.test.ts` 守卫）。
- `src/rust-runtime.ts`：装载 WASM 并安装消息处理器，给 `?worker` 用的副作用入口。
- `src/host/`：宿主经同一 Einfach store 读写原始值/公式、接收成功修改事件。

ui-core 的 exports：`.`（无副作用的 atom、类型、connection factory）、`./rust-worker`、`./rust-runtime`。
`package-boundary.test.ts` 约束根入口不引入视图框架和内联 WASM。

**编辑示例**：`commitCellEditingAtom → setRustCellInputAtom → connection.request('cell.setInput')`，
一次 RPC 返回严格 ACK + 同修订版可见区投影，`applyVisibleProjectionAtom` 直接发布。UI 不预测计算结果、
不用 JS 判断输入类型（原串交给 Rust `set_cell_input`）；ACK 不匹配按 `outcome-unknown` 处理。
提交期间若用户滚动，滚动投影优先，旧窗口的编辑投影被丢弃。

### React 规则（`check:presentation` 机械检查）

- 用 `@einfach/react` 的 `useAtomValue` / `useSetAtom` 读写；不得在 `excel/react-excel/src` 声明表格 atom。
- 不用 `useState` / `useReducer` 存影响渲染的表格状态；不直接调 `store.getter` / `setter` / `sub`。
- 不通过 props 传捆绑 atom 值与 setter 的 controller 对象；`useRef` 只给 DOM 或非渲染身份。
- 一个用户动作派发一个公开 command atom；多 atom 转换、校验、排序和 Rust 请求放进 UI Core 的
  `atom(null, (get, set, input) => ...)`。

### Atom conventions

- ui-core 的 atom 都设 `debugLabel = 'spreadsheet.<feature>.<name>'`（如 `'spreadsheet.findReplace.panel'`）。
- 禁止 per-cell / per-row / per-column atom 家族；大表数据只经有界可见区投影或有上限的 feature 缓存进入 UI。

### Custom / async formulas

自定义公式把参数表达式存为工作簿数据，沿原生 LAMBDA 求值，不执行文件内 JS；引擎契约见
`excel/rust/excel-core/src/CUSTOM_FORMULAS.md`。`FETCHJSON` 是项目扩展的异步函数，经同源 HTTP 与原生
异步队列更新依赖（`excel/react-excel/docs/async-formulas/FETCHJSON.md`）。

### Spill

公式结果为 `Value::Array` 时，锚点 atom 持有数组，其余目标格是读锚点并索引的派生 atom，复用既有依赖与
订阅框架（`excel/rust/excel-core/src/sheet.rs` § "Spill (dynamic-array) infrastructure"）；写入语义见
[ADR 0006](docs/decisions/0006-spill-region-write-semantics.md)。

## 验收与进度

- 每个用户可见功能都要在 `excel/react-excel/e2e/FEATURES.md` 有独立 ID 和一条真实 DOM 主用例；
  测试总数通过不能替代检查真实交互入口。
- 进度与交接：`excel/react-excel/FEATURE_PROGRESS.md`、`excel/react-excel/docs/current-capabilities.md`，
  过程细节写进提交说明，不再维护 `.tasks/` 任务账本（历史在 Git 里）。
- 包对外说明：`excel/react-excel/docs/package/`（安装、宿主数据、发行清单）。React 18.3 是唯一声明基线。
- 发布只走 CI（[ADR 0016](docs/decisions/0016-ci-only-npm-publish.md)），Changesets 管版本；未经授权不 npm 发布。

## 文档规则

文档分四类：**契约**（贴码，随 PR 更新）、**决策**（`docs/decisions/` 下 ADR，接受后不改）、
**提案**（文件名带日期，落地后归档）、**记录**（handoff/audit/perf，生成即冻结，住 `<pkg>/docs/archive/`）。
判定规则与硬约束（禁写会腐坏的全局计数、归档须清扫反向引用等）见 `CONTRIBUTING.md` §「文档规则」。
注意 `docs/` 下不少旧文档仍引用 Solid 时期的 backend 设计，读的时候以本文件和 `docs/ARCHITECTURE.md` 为准。

## solid-js 单实例

根 `pnpm.overrides` 仍钉 `solid-js: 1.9.12`，lockfile 只允许一个 `solid-js@` 版本
（`grep -oE "^  '?solid-js@[0-9.]+" pnpm-lock.yaml | sort -u` 只回一行）。Solid 包虽已暂停，这条不变式
保留，原因见 [ADR 0001](docs/decisions/0001-solid-js-single-instance.md)。

## Build Pipeline

- ui-core / excel-core-ts：TypeScript composite `tsc -build` 出声明，Rollup 出 `cjs/`、`esm/`、`dist/`。
- react-excel：`build:lib`（`vite.lib.config.ts` + 声明 + NOTICE + 产物校验）与 `build:demo`（Vite 演示）。
- `excel/excel-wasm` 的 `build:wasm` 末尾剥调试名并删除 wasm-pack 生成的 `.gitignore`；
  `wasm-pack` 的 `--out-dir` 相对 crate 目录而非 cwd，改那条 script 时注意。
- 所有包 `sideEffects: false`（副作用入口除外）。

## Testing

- Vitest；各包自选 node / jsdom 和自己的转换链。React 测试用 Testing Library。
- 每个测试新建 store（`createStore()`）。
- UI Core 测试验证状态与 Rust 命令语义；React 测试验证渲染、DOM、焦点和事件派发。
- Playwright spec 不在 Vitest `include` 内，只能用包的 `e2e` script 跑；Rust 测试进 crate 目录 `cargo test`。

## Code Style

- 无分号、单引号、100 字符行宽（Prettier）；strict TS + `isolatedModules`；类型导入用 `type`。
- ESLint 禁 console。
- 普通文件 ≤300 行；`spreadsheet-ui-core` 里有不少存量超限文件（如 `auto-fill/command.ts`、
  `operations/index.ts`、`selection/index.ts`），不得继续往里扩写，按职责拆。
