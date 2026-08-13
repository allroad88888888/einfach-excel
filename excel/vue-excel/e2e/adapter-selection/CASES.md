# Vue adapter selection — browser cases

The fixture is a package-local Vite page. It receives a deterministic,
caller-owned backend and store through `SpreadsheetUiProvider`; it does not
create an engine, worker, or demo application.

| ID        | Browser flow                                          | Observable assertion                                                                                       |
| --------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| VE-SEL-01 | Drag from the top-left cell to the bottom-right cell. | The controlled `SpreadsheetGridView` marks exactly that rectangular range as selected in the rendered DOM. |
