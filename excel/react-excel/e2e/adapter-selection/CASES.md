# React adapter selection E2E

This Chromium suite proves the package's controlled adapter boundary, not a
turnkey spreadsheet application. Its fixture supplies a stable, caller-owned
backend and store, renders a caller-owned projection through
`SpreadsheetGridView`, then binds the public pointer-selection hook to that
projection.

The test performs a native mouse drag from the first cell to the lower-right
cell and checks the rendered selected cells and range readout. It therefore
covers React event delivery, browser pointer capture, adapter atom updates,
selection subscription, and controlled DOM projection in one real browser.

It deliberately does not cover worker/WASM backends, clipboard, a site demo,
multiple browsers, or a framework/backend compatibility matrix.
