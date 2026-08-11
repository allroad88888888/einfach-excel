# Provider lifecycle ownership

`SpreadsheetUiProvider` owns workbook binding, capability projection and
optional remote-presence subscription. It keeps the live backend handle in
Solid context; all user-visible lifecycle facts and primitive capabilities are
`@einfach` atoms.

The provider captures capabilities during bind and again after an optional
backend `ready()` resolves. A monotonically increasing session id prevents an
old workbook's ready or presence callback from changing the active workbook.

## Deliberate migration remnants

The following feature leaves still independently capture capability atoms.
They remain untouched for this provider-only issue, but are redundant with the
central provider projection and should be removed in their own migration:

- `filter-sort/SpreadsheetFilterDropdown.tsx`
- `find-replace/SpreadsheetFindReplaceDialog.tsx`
- `menu-bar/SpreadsheetMenuBar.tsx`
- `remove-duplicates/SpreadsheetRemoveDuplicatesDialog.tsx`
- `text-to-columns/SpreadsheetTextToColumnsDialog.tsx`
- `toolbar/useToolbarRuntime.ts`
