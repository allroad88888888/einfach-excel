# Scale facts

This fact sheet indexes current scale-related code facts.

## Scope and evidence limits

Each statement below describes code that is presently in this repository. The
`path:line` citations identify the implementation that supports it; they are
not measurements. This sheet makes no performance, latency, throughput, memory,
or transport guarantee. It contains no benchmark or competitor claim.

The companion contracts provide fuller API and ownership detail:

- [Sparse storage model](SPARSE_STORAGE_MODEL.md)
- [Range dependency tiers](RANGE_DEPENDENCY_TIERS.md)
- [Boundedness contracts](BOUNDEDNESS_CONTRACTS.md)
- [Projection boundary contract](PROJECTION_BOUNDARY_CONTRACT.md)

## Sparse cell records

- `RowMajorMap<V>` stores values in a row-keyed `BTreeMap` whose values are
  column-keyed `BTreeMap`s. Its `len` changes when an address is inserted or
  removed. `excel/rust/excel-core/src/sheet_row_major_map.rs:25-28`,
  `excel/rust/excel-core/src/sheet_row_major_map.rs:60-78`
- A range iterator normalizes its bounds, then uses bounded map ranges for its
  row and column traversal. It yields addresses that have stored entries.
  `excel/rust/excel-core/src/sheet_row_major_map.rs:81-108`
- Formula-address discovery reads both formula-cell and formula-source sparse
  records, merges the resulting addresses, and filters them to the requested
  rectangle. `excel/rust/excel-core/src/sheet_scan.rs:9-50`
- The sparse cell scanner visits primitive cell entries through `range_iter`,
  then merges them with formula addresses while excluding formula-covered
  primitives. `excel/rust/excel-core/src/sheet_scan.rs:72-166`
- Range evaluation delegates its per-cell traversal to that sparse scanner.
  `excel/rust/excel-core/src/sheet_eval_provider.rs:49-62`
- Clearing a range first enumerates non-empty addresses, then writes nulls for
  those addresses through bulk loading. `excel/rust/excel-core/src/sheet_write_clear.rs:124-139`

These facts describe stored records and traversal selection only. They do not
quantify memory use or execution cost for a workbook or a range.

## Tiered range dependencies

- The dependency implementation defines a 256-cell Tier-A geometry limit, a
  256-row band size, and 4,096 limits for Tier-B dependencies and Tier-C
  columns.
  `excel/rust/excel-core/src/sheet_range_tiers.rs:9-15`
- Before selecting a tier, range geometry is normalized and clamped to the
  worksheet bounds; the implementation derives the rectangle's cell and band
  counts from that geometry. `excel/rust/excel-core/src/sheet_range_tiers.rs:44-87`
- A range at or below Tier A takes dependencies through individual cell
  facades. Larger ranges take one epoch dependency per column-row band when the
  band count is within the Tier-B limit.
  `excel/rust/excel-core/src/sheet.rs:1474-1490`,
  `excel/rust/excel-core/src/sheet.rs:1639-1658`
- If Tier B does not apply, a range uses per-column epochs when its column count
  is within the Tier-C limit; otherwise it uses the sheet epoch.
  `excel/rust/excel-core/src/sheet.rs:1491-1502`
- Range-epoch objects are created lazily when a dependency needs them.
  `excel/rust/excel-core/src/sheet.rs:1456-1472`
- When an address's store-root collection is built, existing row-band, column,
  and sheet epoch atoms for that address are included.
  `excel/rust/excel-core/src/sheet.rs:1972-1999`,
  `excel/rust/excel-core/src/sheet.rs:2014-2040`

The limits are current source constants and routing rules. They are not a
promise about recalculation time, invalidation volume, or memory use.

## Bounded display projections

- Projection validation has a default rectangle cap of 50,000 cells. A caller
  may supply a different `maxCells` option. `excel/spreadsheet-ui-core/src/projection/index.ts:36`,
  `excel/spreadsheet-ui-core/src/projection/index.ts:151-201`
- A projection request must have a non-zero safe-integer id, a non-empty sheet
  id, and a non-empty rectangle with non-negative safe-integer bounds before it
  begins.
  `excel/spreadsheet-ui-core/src/projection/index.ts:151-214`
- A projection result is accepted only when its kind, request id, sheet id, and
  rectangle match the request; an explicit request revision must also match.
  Its cells must lie within the requested rectangle and cannot exceed that
  rectangle's cell count.
  `excel/spreadsheet-ui-core/src/projection/index.ts:241-286`
- The request entry point assigns an id and validates a candidate request before
  freezing it and placing it in the projection lanes.
  `excel/spreadsheet-ui-core/src/projection/index.ts:478-530`
- The projection module defines its boundary as display data for a visible
  viewport or explicit range; it excludes fact-store, formula-cache,
  dependency-graph, and full-workbook-snapshot ownership.
  `excel/spreadsheet-ui-core/src/projection/README.md:3-26`

These validation and ownership rules bound a projection payload's accepted
rectangle. They do not guarantee cache behavior, rendering time, or any
transport behavior.

## Range-native operations

- The UI store currently sets a 10,000-cell threshold for range clear, range
  formatting, and clipboard-related address expansion. `excel/solid-excel/src/sheet-store.ts:76-79`
- For a selection above the clear threshold, clearing calls the backend
  `clear_range` rectangle operation. If that operation is unavailable, the
  helper reports failure instead of expanding the selection into cell actions.
  `excel/solid-excel/src/sheet-store.ts:682-735`
- For a selection above the formatting threshold, formatting calls
  `set_format_range`. If unavailable, the helper reports failure; smaller
  selections use the address-oriented path. `excel/solid-excel/src/sheet-store.ts:584-660`
- For a selection above the clipboard threshold, copy attempts range TSV export
  through `export_range_tsv_chunks` or `export_range_tsv`; without either it
  returns `null`. `excel/solid-excel/src/sheet-store.ts:527-575`
- Address expansion for selection-based actions returns `null` above the
  configured limit, preventing those callers from receiving a full address
  grid. `excel/solid-excel/src/sheet-store.ts:806-826`

These are current operation-selection rules. They do not guarantee that a
backend exposes a range operation, nor do they make a transport or timing
claim.
