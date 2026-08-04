# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Einfach ("simple" in German) is a lightweight, Jotai-inspired atom-based state management library. It provides a framework-agnostic core with bindings for React and Solid.js, plus form handling utilities.

## Commands

```bash
# Build (clean types, compile TS, bundle with Rollup)
npm run build

# Run all tests with coverage
npm test

# Run a single test file
npx jest path/to/test.test.ts

# Lint and auto-fix
npm run eslint
```

## Monorepo Structure (pnpm workspaces)

本仓是表格栈，2026-07-29 从 `allroad88888888/einfach` 拆出。库侧（`@einfach/core`、`@einfach/solid`
等）留在原仓，本仓通过 **npm** 消费它们，不再是 workspace 依赖 —— 拆分口径见**原仓**的
`docs/REPO_SPLIT_PLAN_2026-07-28.md`（本仓不留副本，避免两处漂移）。该计划的 P5「原仓收口」
尚未执行，因此原仓仍保留一份 `excel/` 的历史副本 —— 它冻结在拆分时点，**不是**本仓的镜像，
不要在那边改表格栈代码。

```
excel/spreadsheet-ui-core/ → @einfach/spreadsheet-ui-core # Framework-agnostic spreadsheet UI atoms + types (vnext)
excel/excel-core-ts/       → @einfach/excel-core-ts       # TS formula engine (private, parity reference)
excel/solid-excel/         → @einfach/solid-excel         # Solid.js spreadsheet surface (legacy + vnext)
excel/excel-site/          → @einfach/excel-site           # Static docs site with Solid/WASM islands (private, Astro)
excel/rust/core/           → einfach-core (Rust)          # Rust atom store（TS 版 core 的孪生实现）
excel/rust/excel-core/     → einfach-excel-core           # Rust formula / workbook engine
excel/rust/wasm/           → einfach-wasm                 # WASM bindings exposed to excel/solid-excel
```

pnpm workspace 的 glob 是 `excel/*`；`excel/rust/` 不是 npm 包，靠 `build:wasm` 接入
（`wasm-pack` 的 `--out-dir` 相对 crate 目录而非 cwd，改动那条 script 时注意）。

**上游依赖**：`@einfach/core` 与 `@einfach/solid` 从 npm 安装，jest 不再对它们做 `moduleNameMapper`
映射，走 node_modules 解析。这是刻意的 —— 本仓必须能跑在**已发布**的 core 上，而不是某个只存在于
工作区的版本。当前基线 `@einfach/core@^0.4.0` + `@einfach/solid@^0.4.0`，全套测试在其上通过。

**solid-js 单实例不变式**：根 `pnpm.overrides` 钉死 `solid-js: 1.9.12`，lockfile 里**只能有一个
`solid-js@` 版本**（`grep -oE 'solid-js@[0-9.]+' pnpm-lock.yaml | sort -u` 必须只回一行；
`packages:` 与 `snapshots:` 两节各出现一次是正常的）。出现第二个版本就会复发 Provider 重挂 bug
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

**Spill-derived atoms** (`excel/rust/excel-core/src/sheet.rs` § "Spill (dynamic-array) infrastructure"): when a formula evaluates to `Value::Array`, the anchor cell's atom holds the array and each non-(0,0) target gets a derived atom that reads the anchor and indexes into it. Reads, dependency tracking, and subscription propagation reuse the existing atom framework — no parallel spill index — and the WASM boundary collapses `Value::Array` to its top-left scalar for cell-projection reads. **Exception:** custom-formula callbacks (Wave 8.1) DO receive `Value::Array` as a 2-D JS array when a range arg is passed (`=MYFN(A1:A10)`), because the engine forwards array args directly to the JS callback — see `excel/rust/excel-core/src/CUSTOM_FORMULAS.md` "Marshaling".

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

The contract between UI core and any data source lives in `excel/spreadsheet-ui-core/src/backend/types.ts`. Exactly three methods are required — `readVisibleProjection`, `readRangeProjection`, `setCellInput` — every other member is optional (count them with `grep -cE '^\s+[a-zA-Z][a-zA-Z0-9]*\?[(:]' excel/spreadsheet-ui-core/src/backend/types.ts`). UI core hides a toolbar item, menu entry, or keyboard intent when the host backend omits the relevant port — features degrade without UI core knowing the difference between "host does not implement it" and "feature does not exist".

Two reference implementations ship under `excel/solid-excel/src-vnext/adapter/`:

- `static-backend.ts` — in-memory implementation used by smoke tests and the static demo.
- `worker-workbook-backend.ts` — RPC to a Web Worker that owns the WASM `Workbook` from `excel/rust/wasm`.

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
- SWC transforms React/Vanilla; Babel transforms Solid.js (for JSX)
- All packages have `sideEffects: false` for tree-shaking
- `excel/solid-excel` runs `npm run build:wasm` before `vite build` to refresh `excel/solid-excel/wasm-pkg/` from `excel/rust/wasm`

## Testing

- Jest with jsdom environment
- SWC for non-Solid tests, Babel for Solid tests
- `moduleNameMapper` in `jest.config.mjs` resolves `@einfach/*` to source directories
- React tests use `@testing-library/react` with `renderHook`/`act`
- Always create a fresh store per test via `createStore()`
- vnext spreadsheet suites: `npx jest excel/spreadsheet-ui-core --no-coverage` and `npx jest excel/solid-excel --no-coverage`

## Code Style

- No semicolons, single quotes, 100 char line width (Prettier)
- Strict TypeScript (`strict: true`, `isolatedModules: true`)
- No console statements (ESLint)
- Use `type` keyword for type imports
- Versioning managed with Changesets
