# @einfach/react-excel

React 18 adapter for the framework-neutral spreadsheet UI core. It exposes
controlled grid projections plus hooks that read and dispatch the nearest
`SpreadsheetUiProvider` core.

This package is private and has not been published to npm. It is therefore a
workspace integration surface, not an installable public package or a complete
spreadsheet application.

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
split into frozen panes. Data fetching, worker wiring, and projection refresh
remain the host application's responsibility.

## Supported first-tier surfaces

The React bridge currently exposes the package-level primitives needed to wire
these surfaces into a host: grid geometry and rendering, viewport and frozen
projections, selection, pointer and keyboard navigation, editing and IME,
formula bar, name box, sheet tabs, clipboard, and history commands. The host
must supply the UI-core-compatible backend and its projection-refresh policy.

## Explicitly not included

- npm publishing, a worker factory, WASM packaging, or a default backend
- a turnkey spreadsheet page, site demo, or production e2e harness
- toolbar, menu bar, context-menu, dialog, filter/sort, comment, collaboration,
  protection, presence, and status-bar UI
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
