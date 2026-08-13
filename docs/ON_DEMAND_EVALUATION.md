# On-demand formula evaluation contract

This contract describes the current behavior of formula cells admitted through
the bulk-load and storage-replacement paths. It defines when a parked formula
becomes hydrated and evaluated. It does not define a performance target or a
storage-transport policy.

## Admission and parked state

Bulk formula admission retains the source text in `formula_source` and marks
the address in `needs_parse`. The two collections have a one-to-one invariant.
Until hydration, the address has no persistent `Expr`, `FormulaRecord`, static
dependency metadata, or formula text entry in the hydrated maps.

`BulkLoader::set_formula_at` first rejects source that does not parse. Its
lazy-install path also uses a temporary parse result to decide whether to make
a formula-inner derived-atom handle. That result is not retained as the
formula's AST or `FormulaRecord`, and creating the derived atom does not
evaluate it. The later hydrator parses the stored source for the persistent
formula state.

The direct storage-replacement path is deliberately different: it parks every
provided source without parse validation. A malformed parked source therefore
becomes `#VALUE!` when it is first hydrated, rather than at storage install.

| Admission path                       | Before the first value read                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `BulkLoader::set_formula_at`         | Parse-invalid source becomes `#VALUE!`; accepted source is parked for hydration. |
| `BulkLoader::set_formula_pre_parsed` | The caller's parsed expression is discarded and only source is parked.           |
| `Sheet::bulk_install_storage`        | Source is parked without parse validation.                                       |

Source: `excel/rust/excel-core/src/sheet_bulk_formula.rs:22-132`;
`excel/rust/excel-core/src/sheet.rs:270-310`;
`excel/rust/excel-core/src/sheet_bulk_install.rs:76-83,158-177`.

## What triggers hydration

Hydration occurs when a value read reaches `Sheet::peek_value_with_provider`.
That method hydrates before it decides whether the address is a formula, then
reads the formula facade and the Store value. The public sheet and workbook
value-read boundaries settle pending Store reads after the value is obtained.

| Read route                                        | Hydration effect                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `Sheet::get_cell`                                 | Reads the target through `peek_value_with_provider`; a parked target is hydrated.                    |
| `Workbook::get_cell`                              | Reads the target through `WorkbookEvalProvider` and the same sheet method.                           |
| `Workbook::for_each_sparse_range_cell`            | Only formula cells visited by that sparse traversal reach the same read path.                        |
| Formula evaluation through an evaluation provider | A referenced cell is read through the same sheet method, so a parked referenced formula can hydrate. |

Formula-text and formula-presence queries are different observation paths:
`get_formula` reads either hydrated text or parked source, and `has_formula_at`
accepts `needs_parse`. They can report a parked formula without hydrating or
evaluating it.

Source: `excel/rust/excel-core/src/sheet.rs:2520-2553,2586-2612`;
`excel/rust/excel-core/src/workbook_read.rs:6-54`;
`excel/rust/excel-core/src/workbook_eval_provider.rs:41-115`.

## Hydration boundary

`hydrate_formula` is idempotent. For a parked address it removes the address
from `needs_parse` and removes its source in the same operation before parsing.
On a valid expression, it performs the same-sheet static cycle check, collects
static references and range references, records the persistent `FormulaRecord`,
AST, and source text, then materializes the formula-inner. Invalid source or a
cycle becomes a hydrated error formula (`#VALUE!` or `#CYCLE!`, respectively).

After the move, subsequent reads use the hydrated record and Store-backed
formula-inner. Before the move there are no installed same-sheet dependency
edges for that formula; a write to a referenced primitive before the first
formula read is consequently observed when that formula evaluates for the
first time. Replacing or clearing an unhydrated formula drains its parked state
so that old source cannot hydrate later.

Source: `excel/rust/excel-core/src/sheet_hydrate.rs:13-163`;
`excel/rust/excel-core/src/sheet.rs:281-310,2534-2553`;
`excel/rust/excel-core/tests/lazy_bulk_load.rs:21-221`.

## Dynamic-array boundary

For the sheet bulk-load route exercised by the acceptance tests, reading a
parked `SEQUENCE` anchor evaluates the anchor to an array but does not by itself
install spill targets; the test observes targets after a later formula write.
This is not a general statement about every bulk-install entry point:
`bulk_install_storage` has an explicit, separate spill-projection phase after
storage installation.

Source: `excel/rust/excel-core/tests/lazy_bulk_load.rs:224-302`;
`excel/rust/excel-core/src/sheet_bulk_install.rs:213-231`.

## Deliberate non-guarantees

This contract does not promise any of the following:

- remote I/O, data transport, or persistence behavior;
- unloading or eviction of parked, hydrated, or evaluated formulas;
- byte, allocation, memory, latency, throughput, or evaluation-count limits;
- that a value read hydrates only its direct target, because formula evaluation
  may read referenced formulas through its provider; or
- that every bulk entry point has identical parse-validation or spill-projection
  behavior.

The observable guarantee is limited to the state transition above: admitted
bulk formulas can remain parked until a value-read path needs them, and then
move into the hydrated formula state or its documented error state.

## Acceptance evidence

`lazy_bulk_load.rs` covers the current observable boundaries:

- no hydrated formula records, point edges, or range geometry roots after a
  bulk load with no formula value read;
- exactly the read subset hydrates, while full hydration matches the eager
  path's counters;
- a primitive mutation before first read is used by that first evaluation;
- overwrite and clear operations remove unhydrated state; and
- malformed bulk-loader input is rejected immediately, while the storage
  replacement path's deferred malformed-source behavior is defined by its
  hydrator branch.

Source: `excel/rust/excel-core/tests/lazy_bulk_load.rs:21-221,389-465`;
`excel/rust/excel-core/src/sheet_bulk_install.rs:76-83`.
