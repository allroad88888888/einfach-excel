# @einfach/solid-excel

Solid.js spreadsheet surface for the Einfach vnext stack. The package wires `@einfach/spreadsheet-ui-core` atoms into Solid components, ships static and worker-backed adapters, and bundles a WASM build of the Rust formula engine.

feature 归属（哪些事实归引擎、哪些归 UI core）的现行规范源是 [docs/CANONICAL_OWNERSHIP.md](./docs/CANONICAL_OWNERSHIP.md)，判据见 [ADR 0003](../../docs/decisions/0003-engine-owns-filter-sort.md)。

当初推进 online-Excel parity 的多 agent 战役看板已收尾，存于 [docs/archive/](./docs/archive/INDEX.md)（仅供考古）。

## vnext architecture

```
+---------------------------------------------------------------+
|  Solid components  (src-vnext/grid, toolbar, formula-bar, ...) |
|       useAtomValue / useSetAtom from @einfach/solid            |
+---------------------------------------------------------------+
|  SpreadsheetUiProvider  (src-vnext/provider/)                  |
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

Layering rules: components read atoms via `@einfach/solid`; mutations dispatch atoms whose setters call `backend.<method>`. UI core never reaches the worker or WASM directly. The legacy `src/` package is kept for parity tests; new feature work targets `src-vnext/`.

## Components under `src-vnext/`

| Folder                    | Surface                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `provider/`               | `SpreadsheetUiProvider`, `SpreadsheetUiContext`, `useSpreadsheetBackend`, `useSpreadsheetUiStore`                    |
| `adapter/`                | `static-backend`, `worker-workbook-backend`, `worker-protocol`, `worker-runtime`, `worker-factory`, range-TSV helper |
| `grid/`                   | `SpreadsheetGrid` — virtualized cells, selection rendering, fill handle                                              |
| `formula-bar/`            | `SpreadsheetFormulaBar`                                                                                              |
| `toolbar/`                | `SpreadsheetToolbar` plus toolbar command types                                                                      |
| `status-bar/`             | `SpreadsheetStatusBar`                                                                                               |
| `sheet-tabs/`             | `SpreadsheetSheetTabs`                                                                                               |
| `context-menu/`           | `SpreadsheetContextMenu`                                                                                             |
| `find-replace/`           | `SpreadsheetFindReplaceDialog`（现有实现，属于状态迁移目标）                                                         |
| `conditional-formatting/` | `SpreadsheetConditionalFormatDialog`                                                                                 |
| `data-validation/`        | `SpreadsheetDataValidationDialog`                                                                                    |
| `named-ranges/`           | `SpreadsheetNameManagerDialog`                                                                                       |
| `comments/`               | `SpreadsheetCommentThread`                                                                                           |
| `print/`                  | `SpreadsheetPrintPreviewOverlay`                                                                                     |
| `filter-sort/`            | `SpreadsheetFilterDropdown`                                                                                          |
| `presence/`               | `SpreadsheetPresenceOverlay`                                                                                         |
| `protection/`             | `SpreadsheetProtectionUnlockDialog`                                                                                  |
| `history/`                | `SpreadsheetHistoryTimeline`                                                                                         |
| `demos/`                  | `VNextSmokeDemo` (static), `VNextWorkerDemo` (worker + WASM)                                                         |

Public exports flow through `src-vnext/public.ts`. Import via the `@einfach/solid-excel/vnext` subpath:

```ts
import { SpreadsheetUiProvider, SpreadsheetGrid } from '@einfach/solid-excel/vnext'
```

**worker 工厂是第二个入口，不在上面那个 barrel 里。** 它靠 `import.meta.url` 解析 worker
bundle，放进 barrel 会让所有间接导入它的 jest 套件崩在 `Cannot use 'import.meta' outside a
module`（实测 37 个）。宿主走独立子路径：

```ts
import { createWorker } from '@einfach/solid-excel/vnext-worker-factory'
```

理由与不变式见 [ADR 0004](../../docs/decisions/0004-worker-factory-out-of-barrel.md)；
真实用法见 `excel/excel-site/src/spreadsheet/backends.ts`。

### Dialog state pattern

Some existing `*Dialog.tsx` components still read an open atom via `useAtomValue` but keep form state in `createSignal`. Treat that as migration debt, not as the pattern for new work. New or migrated dialogs must keep product, form draft, dirty, validation, pending, and error state in Einfach source/derived/command atoms; Solid-local state is limited to DOM references, one-off measurements, and animation handles. The feature plans linked above define the required state ownership and transitions.

### Provider caveat

`solid-js@1.9.12` re-executes consumer component bodies inside `Provider` when atoms mutate. Per-instance state must live in atoms or be re-derivable from atoms, not in `let` locals at the top of a component. See the root `CLAUDE.md` for the pinned contract test and the open version-alignment item.

## Build

```bash
# Refresh wasm-pkg from excel/rust/wasm, then run Vite
npm run build -w @einfach/solid-excel

# Dev server (assumes wasm-pkg is built)
npm run dev -w @einfach/solid-excel

# Rebuild only the WASM bundle
npm run build:wasm -w @einfach/solid-excel
```

`build:wasm` runs `wasm-pack build --target web --out-dir ../../solid-excel/wasm-pkg ../../excel/rust/wasm` —— `--out-dir` 相对 **crate 目录**解析，产物落在 `excel/solid-excel/wasm-pkg/`。 The repo-level `npm run build` invokes the same step before `tsc -build`, so a fresh clone must have `wasm-pack` and a working Rust toolchain on `PATH`.

## Testing

jest 套件在 `test/` 下（vnext），另有 legacy `src/` 的 parity 套件。Solid 组件用 `@solidjs/testing-library`。规模现场算，不记数字：`npx jest excel/solid-excel --listTests | wc -l`。

```bash
# Whole package
npx jest excel/solid-excel --no-coverage

# Single vnext spec
npx jest excel/solid-excel/test/vnext-grid.test.tsx --runInBand

# Type gate
npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false
```

End-to-end specs use Playwright against the Vite dev preview:

```bash
NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel -- e2e/smoke/vnext-smoke.spec.ts
```

Interaction, clipboard, worker, or viewport changes must also clear an MCP Playwright pass; `excel/spreadsheet-ui-core/docs/CONVENTIONS.md` 列了要记录的项（URL、操作路径、可视 cell 数、console warning/error、与 Excel 的一致性结论）。
