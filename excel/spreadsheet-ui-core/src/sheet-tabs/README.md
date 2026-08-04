# sheet-tabs

Owns sheet tab menu, rename, delete, and tab interaction flow.

## State Decision Template

- Source atoms:
  - `sheetTabsAtom`: lifecycle, captured capabilities, mutation ticket, interaction state, and
    the last intent for one mounted workbook session.
  - `sheetTabsSheetStateAtom`: bounded workbook sheet metadata plus its projection revision.
  - Private `sheetTabsPortsAtom` and `sheetTabsRequestSequenceAtom` retain inert backend ports
    and monotonic identities; adapters cannot write either one directly.
- Derived atoms:
  - `sheetTabsSheetsAtom`: metadata-list projection.
  - `sheetTabsMutationPendingAtom`: whether a sheet-list mutation ticket is active.
- Commands:
  - `initializeSheetTabsAtom` / `disposeSheetTabsAtom`: capture one backend session and
    invalidate all of its outstanding reads or mutations.
  - `activateSheetTabAtom`, `dispatchSheetTabIntentAtom`, `setSheetTabsSheetsAtom`, and
    `patchSheetTabsSheetNameAtom`: local interaction and authoritative projection commands.
  - add, rename, delete, and reorder command atoms are the only mutation launch path; pure
    intent creators remain side-effect free.
- Helpers:
  - `getAdjacentSheetId`: resolves previous/next sheet id from the displayed sheet metadata list.
- Scale bound: tab interaction state and sheet metadata only; no sheet cell content.
- Backend reads: `listSheets` is captured as an optional inert port and validates every
  returned projection before it becomes source state. Optional add/rename/delete/reorder ports
  are invoked only from the Core-owned mutation runner.
- Per-cell/per-row/per-col atom risk: none; no sheet content or dependency graph is stored.
- Tests: `test/sheet-tabs.test.ts`.
