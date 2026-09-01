# @einfach/react-excel

React 18 adapter for the framework-neutral spreadsheet UI core. It exposes
controlled grid projections plus hooks that read and dispatch the nearest
`SpreadsheetUiProvider` core.

This package is private and has not been published to npm. It is therefore a
workspace integration surface, not an installable public package or a complete
spreadsheet application.

## Local Vite demo

The package includes a standalone Vite app with a Univer-inspired workbook
shell. It opens 1,000 records in the existing Rust/WASM worker backend and
renders only a bounded visible projection:

```bash
pnpm --filter @einfach/react-excel dev
```

The demo runs at `http://127.0.0.1:5183`. Scroll and select normally. Double-click
a cell, or select it and press Enter, to edit it; Enter or blur writes through
the backend and refreshes the Rust projection, while Escape cancels. The formula
bar remains read-only, and the demo does not wire clipboard, sheet, formatting,
or history commands. Build and typecheck it independently with:

```bash
pnpm --filter @einfach/react-excel typecheck:demo
pnpm --filter @einfach/react-excel build:demo
```

## What it provides

- `SpreadsheetUiProvider` creates a UI core around a caller-supplied
  `SpreadsheetBackend`; it uses a caller-supplied store when one is provided.
- `SpreadsheetGridView` and `SpreadsheetFrozenGridView` render caller-owned,
  read-only cell projections.
- Hooks cover selection, viewport, pointer selection, keyboard navigation,
  editing, IME composition, formula-bar input, name-box navigation, sheet
  tabs, clipboard commands, and undo/redo history.
- `getSpreadsheetGridGeometry` derives visible grid geometry without owning
  React product state.

All product state remains in `@einfach/spreadsheet-ui-core` atoms. React local
state is not a second spreadsheet store.

## Minimal provider boundary

```tsx
import type { SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetUiProvider, useSpreadsheetSelection } from '@einfach/react-excel'

function SelectionReadout() {
  const selection = useSpreadsheetSelection()
  const { sheetId, row, col } = selection.activeCell
  return <output>{`${sheetId}:${row}:${col}`}</output>
}

export function SpreadsheetShell({ backend }: { backend: SpreadsheetBackend }) {
  return (
    <SpreadsheetUiProvider backend={backend}>
      <SelectionReadout />
    </SpreadsheetUiProvider>
  )
}
```

Most adapter hooks read or dispatch the nearest `SpreadsheetUiProvider` core
and fail fast when no provider is present. `useSpreadsheetValue` is the
exception: it observes any supplied `SpreadsheetValueSource`. Keep a stable
backend instance for the lifetime of one workbook. Replacing it intentionally
creates a new UI core for that provider boundary.

## Controlled grid rendering

`SpreadsheetGridView` does not fetch cells or mutate a workbook. Its owner
passes the visible `CellRange`, `DisplayCell[]`, and optional selection. Use
`SpreadsheetFrozenGridView` when the same caller-owned projection must be
split into frozen panes. Data fetching and worker wiring remain the host
application's responsibility. `useSpreadsheetViewport.refresh()` lets that host
await a re-read of the current bounded window after an acknowledged mutation.

## Supported first-tier surfaces

The React bridge currently exposes the package-level primitives needed to wire
these surfaces into a host: grid geometry and rendering, viewport and frozen
projections, selection, pointer and keyboard navigation, editing and IME,
formula bar, name box, sheet tabs, clipboard, and history commands. The host
must supply the UI-core-compatible backend and its projection-refresh policy.

## Explicitly not included

- npm publishing, a worker factory, WASM packaging, or a default backend
- a production-ready turnkey spreadsheet page or production e2e harness; the
  local Vite demo is development-only
- production command wiring for the demo toolbar, menus, context menus,
  dialogs, filter/sort, comments, collaboration, protection, or presence
- a public compatibility, release-version, or browser-support commitment

Those boundaries are deliberate: this package bridges React to the UI core; it
does not replace a host application's backend, product shell, or release
process.

## Verification

```bash
npx jest excel/react-excel --runInBand --no-coverage
npx tsc -p excel/react-excel/tsconfig.json --noEmit --pretty false
```

For a narrow entry-point check, run:

```bash
npx jest excel/react-excel/test/package-entry.test.ts --runInBand --no-coverage
```
