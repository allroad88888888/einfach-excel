// 一句话：worker 适配器所有失败关闭的容量上限常量。

/**
 * Fail-closed source-size cap for the filter predicate (parity item #29). Since
 * E5 the SCAN itself lives in the engine (`MAX_FILTER_PREDICATE_CELLS`, the same
 * 50k value); this constant is the host mirror of that number, and
 * `FILTER_SORT_SOURCE_TOO_LARGE` is the host error code the adapter maps the
 * engine's structured `source-too-large` refusal onto, so ui-core's over-cap
 * handling is unchanged. Crossing the cap does NOT activate the filter and
 * truncates nothing.
 */
export const MAX_FILTER_SORT_PREDICATE_CELLS = 50_000
export const FILTER_SORT_SOURCE_TOO_LARGE = 'FILTER_SORT_SOURCE_TOO_LARGE'

/**
 * Fail-closed source-size cap for engine physical sort (design-engine-sort
 * §7). The range AREA (rows × cols) upper-bounds the undo before/after
 * snapshot, so a sort whose range spans more than this many cells is
 * rejected BEFORE any read, RPC, undo record, or revision bump — silently
 * dropping undo on a high-frequency reversible op is worse than refusing
 * (contrast the structural mutation's not-undoable degradation, where the
 * op still runs). Computed geometrically from the request range so the
 * gate costs no RPC, matching the pre-dispatch geometry convention of
 * `pasteRange` and the 50k budget of `MAX_FILTER_SORT_PREDICATE_CELLS`.
 * The area is a conservative upper bound on the doc's non-empty measure:
 * it may refuse a large-but-sparse range, never admit one over budget.
 */
export const MAX_SORT_SOURCE_CELLS = 50_000

/**
 * Parity #11 paste-special fail-closed lane (defense in depth). UI-core
 * blocks format-leg kinds pre-dispatch when the adapter's
 * `pasteRangeSupportedKinds` excludes them; a request that arrives
 * anyway is rejected with this structured code BEFORE any read or
 * write — the format leg is never silently dropped.
 */
export const PASTE_RANGE_FORMATS_UNSUPPORTED = 'PASTE_RANGE_FORMATS_UNSUPPORTED'

/**
 * Host-orchestrated undo/redo (parity #15/#36, CANONICAL_OWNERSHIP §4).
 *
 * The adapter records one bounded transaction per undoable mutation:
 * before/after sparse images assembled from the snapshot primitives that
 * are already on the worker protocol (`snapshotRangeSparse`,
 * `snapshotFormatRange`); `undoTransaction` / `redoTransaction` replay
 * them clear-then-restore because `restoreSparse` is an ADDITIVE merge
 * (excel/rust/wasm/src/lib.rs `restore_sparse` contract — design point A).
 *
 * Stack cap mirrors UI-core history (`DEFAULT_HISTORY_CAP = 100`):
 * UI-core evicts oldest entries at 100, so deeper adapter records are
 * unreachable anyway.
 */
export const WORKER_UNDO_STACK_CAP = 100
/**
 * Structural before-images must be FULL-SHEET non-empty snapshots —
 * shift.rs rewrites formulas that referenced a deleted band into
 * irreversible `#REF!` sentinels, so a band-scoped delta cannot restore
 * them (design point B). Threshold carried over from the legacy
 * sheet-store precedent (`STRUCTURAL_SNAPSHOT_MAX = 2000`,
 * excel/solid-excel/src/sheet-store.ts): each structural op serializes the
 * before AND after image across the RPC boundary and up to 100 records
 * stay resident, so the cap bounds worst-case memory at
 * 100 × 2 × 2000 cells. Above the threshold the structural mutation
 * still executes but its record degrades to not-undoable — the snapshot
 * is never truncated.
 */
export const WORKER_STRUCTURAL_SNAPSHOT_MAX = 2000
/**
 * Table-definition transactions (#25) size their cell image PER OPERATION
 * (`TableImageScope`), because the six ports touch wildly different cell
 * sets. Verified against `excel/rust/excel-core/src/workbook.rs`:
 *
 * - `define_table` / `delete_table` (§4.1) mutate the registry map and bump
 *   the tables epoch — they write NO cell input at all ("a Table is a *view*
 *   over existing cells"; delete is convert-to-range and leaves values,
 *   formulas and formats in place). Scope `'registry-only'`, cell image
 *   `null`, no cap: these can never degrade.
 * - `rename_table` / `rename_table_column` (§4.3) run
 *   `rewrite_table_refs_across_sheets`, which `set_formula`s arbitrary cells
 *   on EVERY sheet — a table-scoped or even sheet-scoped range cannot
 *   restore a formula living three sheets away. Scope `'formula-rewrite'`
 *   keeps the workbook-wide sweep but retains only `kind: 'formula'` cells:
 *   `collect_table_ref_rewrites` reads `formula_exprs` / `formula_source`
 *   ONLY, so a literal can never be rewritten, and the rewrite is in-place
 *   (`set_formula` on an existing formula cell) so no cell is created or
 *   destroyed — hence no clear-then-restore either.
 * - `set_table_totals_row` / `set_table_total_function` (§7) write or clear
 *   cells ONLY in the totals-row band of the table's own column span on its
 *   anchor sheet (`range.end.row + 1` when enabling, `range.end.row` when
 *   disabling or retargeting a column). Scope `'totals-band'` mirrors those
 *   two candidate rows and nothing else.
 *
 * This is the #26 fix: before it, EVERY table op mirrored every non-empty
 * cell in the workbook against a 2000-cell cap, so a 500 × 5 data table
 * (2500 cells) silently made create / totals / rename / delete
 * not-undoable — Ctrl+Z became a no-op at a table size Excel users hit
 * immediately. Cost now scales with what the operation touches, not with
 * how much data happens to sit in the workbook.
 *
 * CAP DERIVATION (memory-bound, not latency-bound — a full-workbook sweep
 * measures ~1.18 µs/cell, so even 50 000 cells is ~59 ms, well inside the
 * perf budget; what actually constrains the image is the resident undo
 * stack). Worst case is `WORKER_UNDO_STACK_CAP` (100) records × 2 images
 * (before + after) held simultaneously, so per-image budget = total / 200.
 * Measured V8 retained size of one `SparseCellWire` (200k-element array,
 * `--expose-gc`, heapUsed delta): 120 B for a literal cell, 192 B for a
 * formula cell (~40-char text) — rounded to 128 B / 200 B here.
 *
 * Budget: 128 MiB worst-case resident for the whole table-undo image stack
 * (same order as the 100 × 2 × 2000 × 120 B ≈ 48 MB envelope the structural
 * cap already implies, and a small slice of a browser tab).
 * Per-image budget = 128 MiB / 200 = 671 088 B.
 *
 *   formula image: 671 088 B / 200 B ≈ 3355 cells → 3000
 *   totals band:   671 088 B / 128 B ≈ 5242 cells → 5000
 *
 * Same degradation contract as the structural cap: above the threshold the
 * mutation still executes but its record becomes not-undoable — the image
 * is never truncated.
 */
export const WORKER_TABLE_FORMULA_SNAPSHOT_MAX = 3000
/**
 * Cap for the bounded totals-row image. Geometrically the band is 2 rows ×
 * the table's column span, so this is a safety net rather than a live
 * constraint — it only binds on a table wider than 2500 columns.
 */
export const WORKER_TABLE_TOTALS_SNAPSHOT_MAX = 5000
/**
 * Cap for the E8 whole-workbook FILTER undo image (`filtersSnapshot`), counted
 * as the SUM of `hiddenRows.length` across every sheet entry in ONE image
 * (before OR after), matching how the structural cap checks its before and its
 * after image each against the same threshold.
 *
 * This is the ONLY gate the filter snapshot ever sees. A `filter.set` record
 * nulls both cell images, so no cell cap can look at it; on a structural record
 * the filter payload rides BESIDE a cell image the cell caps size independently,
 * so those caps never account for it either. The hidden-row arrays — tens of
 * thousands of ints on a heavily filtered big table, ×before/after×100 resident
 * records — are unbounded without this cap.
 *
 * CAP DERIVATION — identical envelope to the cell-image caps: 128 MiB worst-case
 * resident, `WORKER_UNDO_STACK_CAP` (100) records × 2 images (before + after)
 * held simultaneously, so per-image budget = 128 MiB / 200 = 671 088 B. The
 * image here is a plain array of row-index integers, so per-element cost is the
 * V8 numeric backing-store slot: MEASURED 8.00 B/int (`--expose-gc`, heapUsed
 * delta over 200k–1M-element arrays, both SMI-built and JSON.parse-origin — a
 * row index is always an Smi). Rounded UP to 16 B/int to absorb the amortized
 * per-`SheetFilterStateWire` wrapper (`sheet` + `rules[]` + object header) this
 * count-based cap does not separately measure — the same "round the per-unit
 * cost up, then the unit count down" discipline the cell caps use (120→128,
 * 192→200).
 *
 *   671 088 B / 16 B ≈ 41 943 ints → 40 000
 *
 * Same degradation contract as the cell-image caps: above the threshold the
 * mutation still executes, but its undo record degrades to NOT-UNDOABLE — the
 * snapshot is never truncated (a truncated filter image would REPLACE the engine
 * filter with a WRONG hidden set on undo, worse than no undo). NARROWING the
 * image to just the mutated sheet was rejected: `restore_filters`
 * (excel/rust/excel-core/src/workbook.rs) is a whole-workbook REPLACE — every sheet
 * absent from the payload has its filter CLEARED — so a single-sheet image would
 * wipe every OTHER sheet's filter on replay. Degradation keeps the sibling
 * contract and touches no Rust.
 */
export const WORKER_FILTER_SNAPSHOT_MAX = 40000
/** u32 max — full-sheet sparse bound accepted by both worker runtimes. */
export const FULL_SHEET_INDEX_BOUND = 0xffffffff

/**
 * Fail-closed size budget for one drag-fill: one full Excel column
 * (1,048,576 rows x 1 column). Host mirror of `MAX_AUTO_FILL_CELLS`
 * (`excel/rust/excel-core/src/auto_fill.rs`); crossing it rejects the request
 * BEFORE any RPC, matching the pre-dispatch geometry convention of
 * `MAX_SORT_SOURCE_CELLS` / `MAX_FILTER_SORT_PREDICATE_CELLS` above. The
 * engine enforces the same cap independently (wire code
 * `AUTO_FILL_TOO_LARGE`) — this is a fail-fast mirror, not the sole guard.
 */
export const MAX_AUTO_FILL_CELLS = 1_048_576
