# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

在线表格栈（einfach-excel）：框架无关的表格 UI 核心（`@einfach/spreadsheet-ui-core`）+
Rust/WASM 公式引擎（`excel/rust/`）+ 基于两者的 Solid.js 表格界面（`@einfach/solid-excel`）。
状态管理由上游 einfach（Jotai 风格 atom 引擎）提供，从 npm 消费，源码不在本仓。

## Commands

```bash
npm run build            # clearTypes → ensureWasm → tsc -build → rollup（缺 excel/excel-wasm/lite 时会调 wasm-pack，需要 Rust 工具链）
npm test                 # 全量 jest（不采覆盖率；报告用 npm run test:coverage）
npx jest path/to/file.test.ts                      # 单个测试文件
npx jest excel/spreadsheet-ui-core --no-coverage   # 分区套件（solid-excel 同理）

npm run lint:check       # eslint 只检查；npm run eslint 检查并自动修
npm run check:docs       # 文档链接门禁（CONTRIBUTING §文档规则）
npm run check:cycles     # dependency-cruiser 循环依赖检查
npm run typecheck:apps   # excel-site 的 tsc --noEmit

npm run dev -w @einfach/excel-site      # 演示 / 门面站（Astro）
npm run dev -w @einfach/solid-excel     # 表格界面自身的 vite dev

# e2e（Playwright，按功能目录组织，每目录 CASES.md 是用例清单权威）
npm run e2e:install -w @einfach/solid-excel                  # 首次装浏览器
NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel
npm run e2e -w @einfach/solid-excel -- e2e/smoke/            # 只跑一个功能目录

# Rust 引擎（各 crate 独立，无 workspace 根 Cargo.toml）
cd excel/rust/excel-core && cargo test               # core / wasm 同理
cd excel/rust/excel-core && cargo bench              # criterion 基准，口径见 excel/rust/docs/PERF.md

# 改了 excel/rust/ 之后刷新 WASM 产物
npm run build:wasm -w @einfach/excel-wasm            # 产物落 excel/excel-wasm/lite/
npm run build:wasm:full -w @einfach/excel-wasm       # full 变体（--features regex-formulas）→ excel/excel-wasm/full/
```

pre-commit（husky）依次跑 `check:docs`、`lint:check`、`typecheck:apps`、增量 `tsc -build`、`jest --onlyChanged` —— 全量 clean build + 全量 jest 的门禁在 CI（ci.yml）；大改动提交前手动跑一次全量 `npm test` 可以省一轮 CI 返工。

## Monorepo Structure (pnpm workspaces)

本仓是表格栈，2026-07-29 从 `allroad88888888/einfach` 拆出。库侧（`@einfach/core`、`@einfach/solid`
等）留在原仓，本仓通过 **npm** 消费它们，不再是 workspace 依赖 —— 拆分口径见**原仓**的
`docs/REPO_SPLIT_PLAN_2026-07-28.md`（本仓不留副本，避免两处漂移）。该计划的 P5「原仓收口」
尚未执行，因此原仓仍保留一份 `excel/` 的历史副本 —— 它冻结在拆分时点，**不是**本仓的镜像，
不要在那边改表格栈代码。

```
excel/spreadsheet-ui-core/ → @einfach/spreadsheet-ui-core # Framework-agnostic spreadsheet UI atoms + types (vnext)
excel/excel-core-ts/       → @einfach/excel-core-ts       # TS formula engine (private) — parity 参照，同时是第二个 worker 后端
excel/excel-wasm/          → @einfach/excel-wasm          # Prebuilt WASM engine artifacts（lite/ + full/，wasm-pack 产物，ADR 0015）
excel/solid-excel/         → @einfach/solid-excel         # Solid.js spreadsheet surface (legacy + vnext)
excel/excel-site/          → @einfach/excel-site           # Static docs site with Solid/WASM islands (private, Astro)
excel/rust/core/           → einfach-core (Rust)          # Rust atom store（TS 版 core 的孪生实现）
excel/rust/excel-core/     → einfach-excel-core           # Rust formula / workbook engine
excel/rust/wasm/           → einfach-wasm                 # WASM bindings，经 @einfach/excel-wasm 分发
```

pnpm workspace 的 glob 是 `excel/*`；`excel/rust/` 不是 npm 包，产物经
`@einfach/excel-wasm`（`excel/excel-wasm/`）的 `build:wasm` 接入
（`wasm-pack` 的 `--out-dir` 相对 crate 目录而非 cwd，改动那条 script 时注意）。

**上游依赖**：`@einfach/core` 与 `@einfach/solid` 从 npm 安装，jest 不再对它们做 `moduleNameMapper`
映射，走 node_modules 解析。这是刻意的 —— 本仓必须能跑在**已发布**的 core 上，而不是某个只存在于
工作区的版本。当前基线 `@einfach/core@^0.4.0` + `@einfach/solid@^0.4.0`，全套测试在其上通过。

**solid-js 单实例不变式**：根 `pnpm.overrides` 钉死 `solid-js: 1.9.12`，lockfile 里**只能有一个
`solid-js@` 版本**（`grep -oE "^  '?solid-js@[0-9.]+" pnpm-lock.yaml | sort -u` 必须只回一行；
`packages:` 与 `snapshots:` 两节各出现一次是正常的。锚定行首是为了排除
`@astrojs/solid-js@…` 这类**包名后缀撞车**的误报）。出现第二个版本就会复发 Provider 重挂 bug
—— 见 [ADR 0001](docs/decisions/0001-solid-js-single-instance.md)，契约测试
`excel/solid-excel/test/provider-remount-1912.test.tsx`。

## 文档规则

本仓文档分四类，生命周期不同：**契约**（贴码，随 PR 更新）、**决策**（`docs/decisions/` 下的 ADR，
接受后不改）、**提案**（文件名带日期，落地后归档）、**记录**（handoff/audit/perf，生成即冻结，
住 `<pkg>/docs/archive/`）。判定规则与硬约束（禁写会腐坏的全局计数、归档须清扫反向引用等）见
`CONTRIBUTING.md` §「文档规则」。仓库级架构地图在 `docs/ARCHITECTURE.md`。

## Architecture

### Core Concepts

上游 atom 引擎（`@einfach/core`）的源码不在本仓，走 npm 安装；概念如下，细节见
[einfach 主仓](https://github.com/allroad88888888/einfach)。

**Atoms**: Fundamental state units. Two types:
- Primitive atoms: `atom(initialValue)` — writable state
- Derived atoms: `atom(get => get(otherAtom) * 2)` — computed from other atoms

**Store**: Manages atom state with automatic dependency tracking via WeakMaps. Key API: `getter(atom)`, `setter(atom, ...args)`, `sub(atom, listener)`.

**Framework bindings** are thin layers over the core. Solid.js (`@einfach/solid`) uses its reactive primitives; 本仓只消费 Solid 绑定。

**Spill-derived atoms** (`excel/rust/excel-core/src/sheet.rs` § "Spill (dynamic-array) infrastructure"): when a formula evaluates to `Value::Array`, the anchor cell's atom holds the array and each non-(0,0) target gets a derived atom that reads the anchor and indexes into it. Reads, dependency tracking, and subscription propagation reuse the existing atom framework — no parallel spill index — and the WASM boundary collapses `Value::Array` to its top-left scalar for cell-projection reads. **自定义公式的回调是另一条边界，双向都用二维 JS 数组**：入参方向，range 实参（`=MYFN(A1:A10)`）以二维数组喂给回调；回程方向，回调返回的二维数组走既有 spill 路径溢出（一维/参差/空/超上限各自的答案、以及与 `SEQUENCE` 共用的 `DYNAMIC_ARRAY_CELL_CAP`，见 `excel/rust/excel-core/src/CUSTOM_FORMULAS.md` § "Marshaling" 与 § "Array returns"）。

**Custom formulas** (Wave 8.1): host-registered JS callbacks invoked as cell-level functions (`=MYTAX(B1)`). Source of truth for the engine contract is `excel/rust/excel-core/src/CUSTOM_FORMULAS.md`; the JS-side host API (registration atoms, name validation, built-in shadow list mirrored from the Rust evaluator) lives in `excel/spreadsheet-ui-core/src/custom-formulas/README.md`. The Solid provider (`excel/solid-excel/src-vnext/provider/SpreadsheetUiProvider.tsx`) diffs the registry atom and forwards add/replace/remove ops to the worker through the optional `registerCustomFormula` / `unregisterCustomFormula` backend ports. **Async (Wave 8.2)**: registrations with `isAsync: true` may `await`; the cell holds `#BUSY!` until the worker pump (`excel/solid-excel/src-vnext/adapter/async-custom-pump.ts`, shared by both worker runtimes) settles the Promise back into the engine, and results are memoized per (name, args) until the next registry change — see CUSTOM_FORMULAS.md § "Async custom formulas".

## Architecture: vnext (spreadsheet stack)

The `vnext` arc layers a spreadsheet on top of the existing atom core. It is the active surface for new feature work; the legacy `excel/solid-excel/src/` shell is kept only for parity tests.

### Three-tier layering

```
excel/spreadsheet-ui-core   (atoms, types, projection contracts — no DOM, no worker, no WASM)
        ↑
excel/solid-excel/src-vnext         (Solid components, Provider, adapters)
        ↑
excel/rust/excel-core + excel/rust/wasm   (formula engine, workbook state) — reached via a worker
```

Rules: `spreadsheet-ui-core` must not import Solid, React, DOM APIs, worker glue, or WASM glue. Workbook facts (cell values, formulas, dependency graph) live behind the backend port, not in UI atoms.

See `excel/spreadsheet-ui-core/docs/ROADMAP.md` for the four-wave feature breakdown and `excel/spreadsheet-ui-core/docs/AGENT_COLLABORATION.md` for the multi-agent kanban.

### Backend port (`SpreadsheetBackend`)

The contract between UI core and any data source lives in `excel/spreadsheet-ui-core/src/backend/types.ts`. Exactly three methods are required — `readVisibleProjection`, `readRangeProjection`, `setCellInput` — every other member is optional (count them scoped to the interface: `awk '/^export interface SpreadsheetBackend/,/^}$/' excel/spreadsheet-ui-core/src/backend/types.ts | grep -cE '^\s+[a-zA-Z][a-zA-Z0-9]*\?[(:]'`). When the host backend omits a port, features degrade in one of three forms — hidden entry, disabled control, or starved state (e.g. history entries dropped so undo never enables) — without UI core knowing the difference between "host does not implement it" and "feature does not exist"; the walkthrough with code citations is `docs/BACKEND_DEGRADATION.md`.

Two reference implementations ship under `excel/solid-excel/src-vnext/adapter/`:

- `static-backend.ts` — in-memory implementation used by smoke tests and the static demo.
- `worker/backend.ts`（`createWorkerWorkbookSpreadsheetBackend`）— RPC to a Web Worker that owns the WASM `Workbook` from `excel/rust/wasm`.

### Worker runtimes（双后端 parity）

Worker 侧有两套运行时实现同一协议：`worker-runtime.ts` / `worker-runtime-full.ts`（Rust/WASM，
两者只是各自静态 import `@einfach/excel-wasm` 与 `@einfach/excel-wasm/full` 的叶子入口，消息循环在
`worker-runtime-core.ts`）与 `worker-runtime-ts.ts`（`@einfach/excel-core-ts`）。Rust 是现役主引擎；
TS 版是 parity 参照兼纯 JS 部署路径，e2e 双后端跑同一批用例钉 parity
（矩阵见 `excel/solid-excel/e2e/BACKEND_PARITY.md`）。worker 工厂**刻意不从** `src-vnext` barrel
导出（`import.meta` 会炸 jest）—— 宿主必须走 `@einfach/solid-excel/vnext-worker-factory` 子路径，
见 [ADR 0004](docs/decisions/0004-worker-factory-out-of-barrel.md)。

### Atom conventions

- Every atom in `spreadsheet-ui-core` sets `debugLabel = 'spreadsheet.<feature>.<name>'` (e.g. `'spreadsheet.findReplace.cursor'`).
- Atoms classify as **source**, **derived**, or **command** in each feature's `README.md`. No per-cell, per-row, or per-column atom families — large tables must be served by the visible-window projection or a bounded cache.
- Bounded caches declare their cap (history 100, named-ranges 500, presence cursors 32, find matches 500, unlocked ranges 256).
- Mutation requests carry optional `requestId` / `revision` / `cancelToken` so workers can ignore stale work.

### Provider and dialog component pattern

`excel/solid-excel/src-vnext/provider/SpreadsheetUiProvider.tsx` calls `createSpreadsheetUi`, then wraps children in both `@einfach/solid`'s `Provider` (for `useAtomValue` plumbing) and `SpreadsheetUiContext.Provider` (so `useSpreadsheetBackend` and `useSpreadsheetUiStore` resolve).

Every modal under `excel/solid-excel/src-vnext/*/Spreadsheet*Dialog.tsx` follows the same shape:

1. Read an open-atom via `useAtomValue` and a close-setter (e.g. `closeFindReplaceAtom`).
2. Hold per-instance form state in `createSignal` locals.
3. Reset signals inside a `createEffect<boolean>` that watches the open-atom and detects a `false → true` edge.

`SpreadsheetFindReplaceDialog.tsx` is the canonical example; the conditional-formatting, data-validation, name-manager, protection-unlock, and comment-thread dialogs all mirror it.

### Resolved: solid-js single-instance requirement (was "1.9.12 Provider interaction")

消费者函数体在 `Provider` 下反复重执行，根因是**一个进程里有两份物理 solid-js**，不是版本 bug。
完整根因分析、修复与不变式见 [ADR 0001](docs/decisions/0001-solid-js-single-instance.md)。
本仓的契约测试是 `excel/solid-excel/test/provider-remount-1912.test.tsx`（消费者函数体每次挂载
只跑一次）。它失败、或 lockfile 出现第二个 solid-js 版本时，去修依赖图 —— 不要在组件里绕。
把每实例的对话框状态放 atom 现在是约定，不是硬要求。

## Build Pipeline

- TypeScript composite project with `tsc -build` for declarations
- Rollup bundles to `cjs/` (.cjs), `esm/` (.mjs), and `dist/`
- `@einfach/solid-excel` 走独立的双形态管线（[ADR 0019](docs/decisions/0019-solid-excel-dual-form-artifacts.md)，
  `rollup.solid-excel.mjs`）：exports 的 `solid` 条件给源码、`import`/`default` 给 babel 预编译的
  **仅 ESM** 产物（worker-factory 依赖 `import.meta`，无 CJS 形态）
- SWC transforms plain TS; Babel transforms Solid.js (for JSX)
- All packages have `sideEffects: false` for tree-shaking
- WASM 产物归 `@einfach/excel-wasm`（`excel/excel-wasm/lite/` 与 `full/`，由 `excel/rust/wasm` 构建）；`excel/solid-excel` 的 `build`/`build:wasm` 委托给它，`build:wasm` 末尾会跑 `strip-wasm-names.mjs` 剥调试名并清掉 wasm-pack 生成的 `.gitignore`
- `excel/excel-site` 是 Astro 静态站 + Solid/WASM islands（[ADR 0007](docs/decisions/0007-astro-static-site-with-solid-wasm-islands.md)），`dev`/`build` 前置 `build:api`（typedoc）

## Testing

- Jest with jsdom environment
- SWC for non-Solid tests, Babel for Solid tests（`excel/solid-excel` 下的 `.tsx` 走 babel-jest）
- `moduleNameMapper` in `jest.config.mjs` maps **only this repo's own packages**（`@einfach/spreadsheet-ui-core`、`@einfach/excel-core-ts`）到源码目录；`@einfach/core` / `@einfach/solid` 刻意走 node_modules（已发布版本）
- Solid tests use `@solidjs/testing-library`
- Always create a fresh store per test via `createStore()`
- vnext spreadsheet suites: `npx jest excel/spreadsheet-ui-core --no-coverage` and `npx jest excel/solid-excel --no-coverage`
- Playwright e2e specs live in `excel/solid-excel/e2e/`（feature 目录 + `CASES.md`，[ADR 0005](docs/decisions/0005-e2e-feature-folders.md)）；jest 的 `testPathIgnorePatterns` 排除它们，只能用 `npm run e2e` 跑
- Rust 引擎测试独立于 jest：进各 crate 目录 `cargo test`

## Code Style

- No semicolons, single quotes, 100 char line width (Prettier)
- Strict TypeScript (`strict: true`, `isolatedModules: true`)
- No console statements (ESLint)
- Use `type` keyword for type imports
- Versioning managed with Changesets
