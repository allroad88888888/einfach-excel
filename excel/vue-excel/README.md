# @einfach/vue-excel

Vue adapter source for the framework-neutral spreadsheet UI core. It exposes
controlled grid projections plus hooks that read or dispatch the nearest
`SpreadsheetUiProvider` core.

This document defines the consumption boundary of the private Vue adapter package.

This package is private and is not published to npm. It is a workspace source
surface, not an independently verified offline installation path or a complete
spreadsheet application.

## What it provides

- `SpreadsheetUiProvider` creates a UI core around a caller-supplied
  `SpreadsheetBackend`.
- `SpreadsheetGridView` and `SpreadsheetFrozenGridView` render caller-owned,
  read-only cell projections.
- Root hooks cover selection, viewport, keyboard navigation, IME composition,
  editing, clipboard commands, history, formula-bar input, name-box
  navigation, and sheet tabs.
- `getSpreadsheetGridGeometry` derives visible grid geometry without owning
  Vue product state.
- `@einfach/vue-excel/pointer-selection` exposes the pointer-selection hook
  as a separate adapter entry point.

All spreadsheet product state remains in `@einfach/spreadsheet-ui-core` atoms.
Vue reactivity bridges subscriptions and cleanup; it does not create a second
spreadsheet store.

## Provider boundary

`SpreadsheetUiProvider` receives a caller-owned `SpreadsheetBackend`. It uses a
caller-supplied `@einfach/core` `Store` when one is provided. Most adapter hooks
read or dispatch the nearest provider core and fail fast when no provider is
present.

`useSpreadsheetValue` is the exception. It observes a supplied
`SpreadsheetValueSource` and does not require a provider. Keep a backend stable
for the lifetime of one workbook. Replacing it intentionally creates a new UI
core at that provider boundary.

## Controlled grid projections

`SpreadsheetGridView` receives its `range`, sparse `cells`, and selected range
from the caller. It renders projections without reading the backend or retaining
a second cell model. `SpreadsheetFrozenGridView` composes those projections into
core-derived frozen windows; callers retain the viewport and freeze settings.

## Current adapter surface

The exported hooks are narrow bridges to existing UI-core commands. They expose
selection, navigation, editing, clipboard, history, formula-bar, name-box, and
sheet-tab capabilities through the closest provider. They do not define new
workbook semantics or a second command protocol.

## Not yet verified or included

- A public npm package, release channel, or independently verified offline
  installation path.
- A default Worker or WASM factory. Callers own backend construction and supply
  the resulting `SpreadsheetBackend`.
- A browser end-to-end suite, demo route, or Vue SFC compilation path for this
  package.
- A turnkey spreadsheet shell, toolbar, formula editor, or product-level
  interaction policy beyond the exported controlled views and hooks.
- A public compatibility, support, or service commitment.

The existing source and package checks verify the adapter boundary. They do not
establish publication readiness, browser support, framework completeness, or
application-level parity.

## Scoped package checks

Run these commands from the repository root:

```bash
npx jest excel/vue-excel --runInBand --no-coverage
npx tsc -p excel/vue-excel/tsconfig.json --noEmit --pretty false
```

These commands check source and package tests in this repository. They are not
a claim that a published npm artifact is installable or that every Vue host
environment is supported.
