# React Excel

Private Vite product for an editable sales-order workbook backed by the Einfach Rust/WASM engine.

## Current product

The workbook opens 1,000 sales-order records and renders a bounded 32-row projection instead of
mounting the full sheet. It currently supports:

- single-cell and drag selection;
- scrolling from the first row through the last record;
- double-click or Enter to start in-cell editing;
- Enter or blur to write through the Rust backend and refresh the visible projection;
- Escape to cancel an edit without writing.

The formula bar, ribbon, sheet tab, and zoom surfaces are presentational. Clipboard, history,
formatting, sheet commands, and other workbook commands are not wired.

## Rust-only runtime boundary

```text
React workbook
  → internal UI-core runtime modules
  → SpreadsheetBackend
  → @einfach/solid-excel/vnext-worker-runtime?worker
  → Rust/WASM workbook
```

The product uses the existing Solid package's neutral worker backend and lite Rust/WASM runtime.
It has no TypeScript engine, static backend, or runtime fallback. Workbook values and mutations
remain authoritative behind `SpreadsheetBackend`; React owns only product composition and the
controlled visible window.

## Product structure

```text
src/
├── main.tsx
├── app/                              # startup and global styles
├── product/
│   └── sales-orders/
│       ├── data/                     # sheet definition and Rust import seed
│       └── runtime/                  # Rust workbook creation and initialization
└── workbook/
    ├── shell/                        # workbook page composition
    ├── chrome/
    │   ├── formula-bar/              # active-range value surface
    │   ├── footer/                   # sheet navigation and status surface
    │   ├── header/                   # workbook identity surface
    │   └── ribbon/                   # command discovery surface
    ├── editing/                      # acknowledged cell-editing use case
    ├── grid/
    │   ├── cells/                    # projected cell table
    │   ├── editor/                   # in-cell editing overlay
    │   └── viewport/                 # bounded scrollable grid surface
    ├── projection/                   # controlled visible-window projection
    ├── runtime/                      # internal React/UI-core runtime boundary
    └── selection/                    # selection observation and pointer gestures

test/
├── product/sales-orders/             # product seed and Rust import tests
└── workbook/
    ├── editing/                      # cell-editing interaction tests
    └── projection/                   # visible-window interaction tests
```

Product modules use precise relative imports. There is no public package entry or internal barrel.

## Run and verify

```bash
pnpm --filter @einfach/react-excel dev
pnpm --filter @einfach/react-excel typecheck
pnpm --filter @einfach/react-excel build
pnpm --filter @einfach/react-excel test
```

The development server listens on `http://127.0.0.1:5183`. The product test suite lives in
`test/workbook/` and covers Rust seed import, bounded projection, and acknowledged cell editing.
