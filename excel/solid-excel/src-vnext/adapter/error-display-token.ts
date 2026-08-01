/**
 * The USER-VISIBLE token for an evaluation error — the TypeScript twin of
 * `einfach_excel_core::format::error_display_token`
 * (`excel/rust/excel-core/src/format.rs`), which carries the normative
 * registry of non-Excel codes. Keep the two in sync; the always-on
 * `cross-engine-parity-smoke.test.ts` pins every token on both engines and
 * goes red on a one-sided change.
 *
 * Both TS surfaces on this side of the wire carry an engine-internal error
 * vocabulary that is WIDER than Excel's:
 *
 *  - `@einfach/excel-core-ts`'s `ErrorCode` union (consumed by
 *    `worker-runtime-ts.ts`), and
 *  - the `'#…'`-prefixed strings the static demo evaluator passes around
 *    (`static-formula-eval.ts`).
 *
 * Three codes in that vocabulary have no Excel counterpart. Two collapse
 * here, one deliberately does not:
 *
 *  - `#TYPE!` → `#VALUE!`. Excel has no such code, so a cell showing
 *    `#TYPE!` is something no real spreadsheet can produce. The code
 *    survives internally because the DIAGNOSTIC distinction earns its keep —
 *    it says an argument-type guard fired (SUBTOTAL's function-number check,
 *    the engine's ~350 built-in guards, the custom-formula marshaling
 *    fallback) where `#VALUE!` would not.
 *  - `#ARGS!` → `#VALUE!`. Excel rejects a wrong argument count at ENTRY
 *    TIME — the formula bar refuses the edit with a dialog — so the mistake
 *    never becomes a cell error and Excel has no code for it. Neither engine
 *    here has an entry-time validation layer, so the mistake has to survive
 *    as a cell value, and `#VALUE!` is the closest thing a spreadsheet user
 *    can read. `ERROR.TYPE` already grades `#ARGS!` as 3 — `#VALUE!`'s
 *    number — so the collapse costs no host-visible information.
 *  - `#CYCLE!` stays `#CYCLE!`. This is a DELIBERATE EXTENSION, not an
 *    oversight: Excel displays `0` plus a status-bar warning for a circular
 *    reference, which hides a real bug inside a plausible number. A distinct
 *    searchable code is strictly more useful, and it is the one place this
 *    repo takes that trade. Do not "finish the job" by collapsing it.
 *
 * So the split is: keep the codes internally, collapse the two at the
 * rendering boundary. This function is that boundary, and ONLY that
 * boundary. Serialization channels deliberately keep the internal spelling:
 *
 *  - formula text — `=#TYPE!` / `=#ARGS!` must keep parsing
 *    (`ERROR_LITERAL_RE`, `parseFormula`), because the Rust twin's
 *    `shift::render_formula` writes error codes back into formula source on
 *    every structural edit; a parser that stopped accepting them would break
 *    stored formulas on the next row insert;
 *  - persistence / clipboard wire — `snapshotRangeSparse` and the TSV export
 *    emit the captured code verbatim, mirroring `sparse_cell_from_value`'s
 *    use of `Display`, because a restore must reproduce the exact variant it
 *    captured.
 *
 * A serialization format may be WIDER than the display vocabulary, never
 * narrower. Host-facing consequences in
 * `excel/rust/excel-core/src/CUSTOM_FORMULAS.md` § "Internal vs displayed
 * codes".
 */
const NON_EXCEL_DISPLAY_COLLAPSE: Readonly<Record<string, string>> = {
  '#TYPE!': '#VALUE!',
  '#ARGS!': '#VALUE!',
}

export function errorDisplayToken(code: string): string {
  return NON_EXCEL_DISPLAY_COLLAPSE[code] ?? code
}
