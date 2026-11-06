---
'@einfach-excel/spreadsheet-ui-core': minor
'@einfach-excel/react-excel': minor
'@einfach-excel/excel-wasm': minor
---

Add `createWorkbookApi(store)` for explicit worksheet/range operations, navigation, editing,
native history, before-change cancellation, and interaction subscriptions. Preserve native
commit outcomes, worksheet identities, navigation, and unrelated geometry during API updates.

Add stable ribbon item visibility controls, configurable row/column header dimensions,
and clipped Canvas cell painting hooks to the React spreadsheet.

Add host highlights, pixel visibility queries, formula dialog controls, and nested draw/calculation
suspension. Add native rich text runs with history and content movement, a segment editor,
DOM/Canvas rendering, and native-file/XLSX round trips.

Keep plain cell text on the direct rendering path and reserve a bounded six-screen
vertical projection buffer so coalesced wheel input does not outrun painted cells.
