# @einfach/solid-excel

> **暂停维护。** 源码仅保留作考古参考；该包已退出默认构建、测试、CI、发布与 React
> 主线兼容范围。当前产品入口是 [`../react-excel`](../react-excel/README.md)。

Solid.js spreadsheet surface for the active Einfach stack. The package wires `@einfach/spreadsheet-ui-core` atoms into Solid components, ships static and worker-backed adapters, and bundles a WASM build of the Rust formula engine.

feature 归属（哪些事实归引擎、哪些归 UI core）的现行规范源是 [docs/CANONICAL_OWNERSHIP.md](./docs/CANONICAL_OWNERSHIP.md)，判据见 [ADR 0003](../../docs/decisions/0003-engine-owns-filter-sort.md)。

当初推进 online-Excel parity 的多 agent 战役看板已收尾，存于 [docs/archive/](./docs/archive/INDEX.md)（仅供考古）。

## Active architecture

```
+---------------------------------------------------------------+
|  Solid components  (src/grid, toolbar, formula-bar, ...) |
|       useAtomValue / useSetAtom from @einfach/solid            |
+---------------------------------------------------------------+
|  SpreadsheetUiProvider  (src/provider/)                  |
|    - createStore + createSpreadsheetUi                         |
|    - exposes SpreadsheetUiContext (backend, store)             |
+---------------------------------------------------------------+
|  spreadsheet-ui-core atoms  (framework-agnostic state)         |
|    selection / viewport / editing / clipboard / find / ...     |
+---------------------------------------------------------------+
|  SpreadsheetBackend port                                       |
|       |                                                        |
|       +-- static-backend.ts        (in-memory)                 |
|       +-- worker-workbook-backend.ts                           |
|                |                                               |
|                +-- worker-protocol.ts  (typed RPC)             |
|                +-- worker-runtime.ts   (runs in Web Worker)    |
|                         |                                      |
|                         +-- excel/rust/wasm  (einfach_wasm.js)       |
|                                  |                             |
|                                  +-- excel/rust/excel-core           |
|                                       (Workbook, eval, undo)   |
+---------------------------------------------------------------+
```

Layering rules: components read atoms via `@einfach/solid`; mutations dispatch atoms whose setters call `backend.<method>`. UI core never reaches the worker or WASM directly. The legacy `legacy/` package is kept for parity tests; new feature work targets `src/`.

## Components under `src/`

| Folder                    | Surface                                                                                                                                                                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider/`               | `SpreadsheetUiProvider`, `SpreadsheetUiContext`, `useSpreadsheetBackend`, `useSpreadsheetUiStore`                                                                                                                                                                             |
| `adapter/`                | `static-backend`, `worker-workbook-backend`, `worker-protocol`, `worker-factory`, range-TSV helper；WASM worker 拆成 `worker-runtime-core`（消息循环）+ `worker-commands-*`（命令族）+ `worker-runtime` / `worker-runtime-full`（分别静态 import lite / full 产物的叶子入口） |
| `grid/`                   | `SpreadsheetGrid` — virtualized cells, selection rendering, fill handle                                                                                                                                                                                                       |
| `formula-bar/`            | `SpreadsheetFormulaBar`                                                                                                                                                                                                                                                       |
| `toolbar/`                | `SpreadsheetToolbar` plus toolbar command types                                                                                                                                                                                                                               |
| `status-bar/`             | `SpreadsheetStatusBar`                                                                                                                                                                                                                                                        |
| `sheet-tabs/`             | `SpreadsheetSheetTabs`                                                                                                                                                                                                                                                        |
| `context-menu/`           | `SpreadsheetContextMenu`                                                                                                                                                                                                                                                      |
| `find-replace/`           | `SpreadsheetFindReplaceDialog`（现有实现，属于状态迁移目标）                                                                                                                                                                                                                  |
| `conditional-formatting/` | `SpreadsheetConditionalFormatDialog`                                                                                                                                                                                                                                          |
| `data-validation/`        | `SpreadsheetDataValidationDialog`                                                                                                                                                                                                                                             |
| `named-ranges/`           | `SpreadsheetNameManagerDialog`                                                                                                                                                                                                                                                |
| `comments/`               | `SpreadsheetCommentThread`                                                                                                                                                                                                                                                    |
| `print/`                  | `SpreadsheetPrintPreviewOverlay`                                                                                                                                                                                                                                              |
| `filter-sort/`            | `SpreadsheetFilterDropdown`                                                                                                                                                                                                                                                   |
| `presence/`               | `SpreadsheetPresenceOverlay`                                                                                                                                                                                                                                                  |
| `protection/`             | `SpreadsheetProtectionUnlockDialog`                                                                                                                                                                                                                                           |
| `history/`                | `SpreadsheetHistoryTimeline`                                                                                                                                                                                                                                                  |
| `demos/`                  | `VNextSmokeDemo` (static), `VNextWorkerDemo` (worker + WASM)                                                                                                                                                                                                                  |

Public exports flow through `src/public.ts`. Import via the `@einfach/solid-excel` subpath:

```ts
import { SpreadsheetUiProvider, SpreadsheetGrid } from '@einfach/solid-excel'
```

**worker 工厂是第二个入口，不在上面那个 barrel 里。** 它靠 `import.meta.url` 解析 worker
bundle，放进 barrel 会让不支持 `import.meta` 的测试转换链崩在
`Cannot use 'import.meta' outside a module`。宿主从独立子路径取得真实 factory，并把它交给根入口导出的 worker backend：

```ts
import { createWorkerWorkbookSpreadsheetBackend } from '@einfach/solid-excel'
import { defaultVNextWorkbookWorkerFactory } from '@einfach/solid-excel/worker-factory'

const backend = createWorkerWorkbookSpreadsheetBackend({
  workerFactory: defaultVNextWorkbookWorkerFactory,
})
```

理由与不变式见 [ADR 0004](../../docs/decisions/0004-worker-factory-out-of-barrel.md)；
真实用法见 `excel/excel-site/src/spreadsheet/backends.ts`。

### Dialog state pattern

Some existing `*Dialog.tsx` components still read an open atom via `useAtomValue` but keep form state in `createSignal`. Treat that as migration debt, not as the pattern for new work. New or migrated dialogs must keep product, form draft, dirty, validation, pending, and error state in Einfach source/derived/command atoms; Solid-local state is limited to DOM references, one-off measurements, and animation handles. The feature plans linked above define the required state ownership and transitions.

### Solid runtime instance invariant

This package requires one physical `solid-js` runtime per process. The root
`pnpm.overrides` pins `solid-js` to `1.9.12`; it prevents the historical
Provider remount symptom caused by a split resolver graph. A normal atom update
does not itself re-execute a consumer component body. If that symptom returns,
or the check below prints anything other than `solid-js@1.9.12`, repair the
dependency graph instead of adding a component-level workaround:

```bash
grep -oE '^  solid-js@[0-9.]+' pnpm-lock.yaml | sort -u
pnpm --filter @einfach/solid-excel exec vitest run test/provider-remount-1912.test.tsx
```

The package runtime cannot reliably discover another `solid-js` branch in the
resolver graph, so it intentionally has no development-time duplicate-instance
warning: such a warning would produce false positives and false negatives.

This invariant does not relax state ownership. Product state remains in
Einfach atoms; Solid-local state is only for non-product DOM references,
one-off measurements, and animation handles.

## Build

```bash
# Refresh the WASM artifacts from excel/rust/wasm, then run Vite
npm run build -w @einfach/solid-excel

# Dev server (assumes excel/excel-wasm/lite is built)
npm run dev -w @einfach/solid-excel

# Rebuild only the WASM bundle
npm run build:wasm -w @einfach/excel-wasm
```

WASM 产物归 `@einfach/excel-wasm`（`excel/excel-wasm/lite/` 与 `full/`）；本包的
`build:wasm` 只是它的委托。真正的构建是 `wasm-pack build --target web --out-dir
../../excel-wasm/lite ../rust/wasm` —— `--out-dir` 相对 **crate 目录**解析。 The
repo-level `npm run build` invokes the same step before `tsc -build`, so a fresh
clone must have `wasm-pack` and a working Rust toolchain on `PATH`.

## Testing

Vitest 套件在 `test/` 下（历史文件名可能仍含 `vnext`），另有 legacy `legacy/` 的 parity 套件。Solid 组件用 `@solidjs/testing-library`。规模现场算，不记数字：`pnpm --filter @einfach/solid-excel exec vitest list | wc -l`。

```bash
# Whole package
pnpm --filter @einfach/solid-excel test

# Single active spec (historical filename)
pnpm --filter @einfach/solid-excel exec vitest run test/vnext-grid.test.tsx

# Type gate
npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false
```

End-to-end specs use Playwright against the Vite dev preview:

```bash
NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel -- e2e/smoke/vnext-smoke.spec.ts
```

Interaction, clipboard, worker, or viewport changes must also clear an MCP Playwright pass; `excel/spreadsheet-ui-core/docs/CONVENTIONS.md` 列了要记录的项（URL、操作路径、可视 cell 数、console warning/error、与 Excel 的一致性结论）。
