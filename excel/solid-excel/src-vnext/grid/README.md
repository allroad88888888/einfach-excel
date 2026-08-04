# Spreadsheet grid

The Solid grid is an adapter over `@einfach/spreadsheet-ui-core`. `SpreadsheetGrid.tsx`
is the composition root: it creates one local runtime, hydrates persisted viewport
metadata through UI-core commands, and installs the focused controllers below.

## Module boundaries

- `grid-view-state.ts`, `grid-layout.ts`, and `grid-projection-controller.ts` derive
  the visible window, geometry, and sparse projection transport.
- `grid-selection.ts`, `grid-pointer-selection.ts`, `grid-fill-*`,
  `grid-editing-controller.ts`, `grid-edit-navigation.ts`, `grid-clipboard.ts`,
  `grid-format-controller.ts`, and `grid-keyboard-controller.ts` translate user
  input into UI-core commands.
- `grid-outline-state.ts`, `grid-resize-controller.ts`,
  `grid-auto-fit-controller.ts`, `grid-context-menu.ts`, and
  `grid-overlay-controller.ts` each own one visual interaction concern.
- `grid-lifecycle.ts` owns subscriptions, DOM sizing, and cleanup.
- `SpreadsheetGridView.tsx`, `SpreadsheetGridTable.tsx`,
  `SpreadsheetGridDataRow.tsx`, `SpreadsheetGridCell.tsx`,
  `SpreadsheetGridCellEditor.tsx`, and `SpreadsheetGridOutline.tsx` are the
  corresponding render-only layers.
- `axis-geometry.ts`, `cell-format.ts`, `grid-auto-fit.ts`, and
  `grid-constants.ts` are pure helpers; `grid-runtime.ts` is the local controller
  wiring abstraction.

## Atom classification

- Source atoms: none. The grid creates no UI state authority and does not keep a
  duplicate cell, selection, viewport, or format cache.
- Derived reads: viewport metrics, sparse projection, selection, editing,
  freeze/hidden/outline, filter, presence, and spill projections are all read from
  UI-core atoms.
- Commands: pointer, keyboard, clipboard, editing, formatting, resize, outline,
  projection, and persisted viewport hydration writes are dispatched with the
  relevant UI-core command atom. The adapter never calls a direct persisted-view
  backend read.

The runtime has component-local closures only. It deliberately has no per-cell,
per-row, or per-column atom family; virtual rendering stays bounded by the visible
window and the UI-core sparse projection.

## Verification

Grid behavior is covered by `test/vnext-grid*.test.tsx`, `test/vnext-outline.test.tsx`,
and the dependent copy, spill, filter/sort, mutation-gateway, and worker UI suites.
