# Cross-sheet evaluation contract

This note describes the current workbook-local behavior of formulas that read
another sheet. It is limited to the Rust workbook evaluator and its lazy
materialization path; it is not a transport, storage, or performance contract.

## Read boundary

`Workbook::get_cell` resolves the requested workbook sheet name and cell
address. It returns `Value::Null` when either cannot be resolved at that public
entry point. For a valid request it creates a `WorkbookEvalProvider`, reads the
cell through `peek_value_with_provider`, and then calls
`Store::settle_pending_reads` on the workbook's shared Store.

`Workbook::for_each_sparse_range_cell` uses the same provider and settles the
same Store after visiting the non-empty cells in its requested range. A formula
visited through either public read therefore evaluates in workbook context,
rather than with the single-sheet provider.

Sources: `excel/rust/excel-core/src/workbook_read.rs:4-67`;
`excel/rust/excel-core/src/sheet.rs:2534-2551`.

## Provider routing

The provider tracks the current sheet index while evaluating an expression.
For `SheetName!A1`, it resolves `SheetName` through the workbook name map,
temporarily makes that sheet current, and reads it with
`peek_value_with_provider`. The guard restores the prior current-sheet index
when the nested read ends. Scalar reads collapse array values for evaluation;
the raw variants preserve them where the evaluator needs that distinction.

The range variants use sparse traversal but keep the same workbook provider.
Consequently, a formula inside an iterated range can itself resolve a
cross-sheet reference; the single-sheet `peek_value` path would not supply
that routing.

Sources: `excel/rust/excel-core/src/workbook_eval_provider.rs:20-116`.

## Missing and not-yet-materialized state

- A formula reference to an unknown sheet produces `ValueError::InvalidRef`
  (`#REF!`) from `sheet_cell` and `raw_sheet_cell`; a cross-sheet range reports
  that error at the normalized range start.
- A valid but unset source cell reads as `Value::Null`.
- A bulk-loaded formula can be parked as source text with `needs_parse` before
  it has a persistent formula record. `peek_value_with_provider` hydrates that
  formula before selecting its formula or primitive path, so the first
  workbook-context read can materialize and evaluate it. This does not mean a
  bulk write avoids every temporary parse: its writer calls `parse_formula` to
  decide whether to materialize the formula inner, while persistent
  `FormulaRecord` hydration remains deferred.

Sources: `excel/rust/excel-core/src/workbook_eval_provider.rs:48-108`;
`excel/rust/excel-core/src/sheet.rs:2534-2551`;
`excel/rust/excel-core/src/sheet_bulk_formula.rs:118-145`.

## Topology and reactive propagation

Sheet references are resolved by name. `move_sheet` rotates workbook-owned
sheet data, rebuilds the name lookup, and republishes topology. Thus a formula
installed before a sheet move can resolve its named source after that move.

Once a lazy cross-sheet formula is read, its access runs through the workbook's
shared Store. Writes to the source sheet then propagate through the
materialized Store path: the dependent formula rederives and subscribers see
the update. This is established for both a direct cross-sheet cell reference
and `SUM` over a cross-sheet range after a move that occurs before the first
read.

Sources: `excel/rust/excel-core/src/workbook_topology.rs:102-133`;
`excel/rust/excel-core/src/workbook_read.rs:21-24`;
`excel/rust/excel-core/tests/lazy_cross_sheet.rs:12-83`.

## Explicit non-guarantees

This contract makes no promise about remote I/O, sheet unloading or reloading,
byte transfer, cache capacity or eviction, allocation bounds, or any latency,
throughput, and memory-performance SLA. The cited implementation and tests
exercise only an in-memory workbook, its name-based sheet routing, and its
shared Store propagation.
