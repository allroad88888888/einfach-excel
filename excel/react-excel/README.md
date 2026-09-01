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
├── app/                    # startup and global styles
└── workbook/
    ├── Workbook.tsx        # workbook page composition
    ├── backend/            # Rust worker creation and sales-order seed import
    ├── chrome/             # header, ribbon, formula bar, footer
    ├── data/               # sales-order definitions
    ├── editing/            # acknowledged cell-editing use case
    ├── grid/               # bounded grid DOM and cell editor
    ├── projection/         # controlled visible-window projection
    ├── runtime/            # internal React/UI-core runtime boundary
    └── selection/          # selection observation and pointer gestures
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
