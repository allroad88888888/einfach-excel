/**
 * always-on 跨引擎烟测的**场景数据**：每一类分歧的夹具、地址、以及闭式期望值。
 *
 * 与规格分开的理由：加一类分歧时改的是这里（一行 case + 一行 workload），
 * 而规格本身（怎么跑两个引擎、怎么比对）几乎不动。混在一份里，读的人得先
 * 翻过 180 行数据才能看到第一条断言。
 *
 * 期望值一律写成**字面量**而不是「两侧相等」—— 相等只能证明两个引擎一致，
 * 证明不了它们一起错。规格里两种断言都做。
 *
 * 规格在 `cross-engine-parity-smoke.test.ts`，引擎驱动在
 * `cross-engine-parity-engines.ts`。
 */
import { a1, type WorkloadCell } from './cross-engine-parity-engines'


/** Row-major address list of a rectangle anchored at (row0, col0). */
export function region(row0: number, col0: number, rows: number, cols: number): string[] {
  const out: string[] = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) out.push(a1(row0 + r, col0 + c))
  }
  return out
}

/**
 * Every error literal the formula parsers accept, paired with the token a
 * cell must SHOW for it. The two columns differ on exactly one row.
 *
 * `#TYPE!` and `#ARGS!` have no Excel counterpart: both engines keep them as
 * internal diagnostic codes (the argument-type / arity guards raise them, the
 * custom-formula return map accepts them, formula text and persistence
 * records carry them) and both collapse them to `#VALUE!` at the rendering
 * boundary — `format::error_display_token` in Rust, `errorDisplayToken` in
 * TS. `#TYPE!` is the row that caught a real divergence: only the TS side had
 * missed that collapse.
 *
 * `#CYCLE!` is non-Excel too and is DELIBERATELY displayed as-is on both
 * engines — Excel's answer (`0` + a status-bar warning) hides a real bug
 * inside a plausible number. That row pins a decision, not a pending item;
 * see the registry on `format::error_display_token` before "fixing" it.
 *
 * Changing any row here is a two-engine change: update Rust and TS in the
 * same commit or this table goes red.
 */
export const ERROR_LITERALS: ReadonlyArray<readonly [literal: string, displayed: string]> = [
  ['#NULL!', '#NULL!'],
  ['#DIV/0!', '#DIV/0!'],
  ['#N/A', '#N/A'],
  ['#REF!', '#REF!'],
  ['#VALUE!', '#VALUE!'],
  ['#NAME?', '#NAME?'],
  ['#NUM!', '#NUM!'],
  ['#CYCLE!', '#CYCLE!'],
  ['#TYPE!', '#VALUE!'],
  ['#ARGS!', '#VALUE!'],
  ['#SPILL!', '#SPILL!'],
  ['#CALC!', '#CALC!'],
  ['#BUSY!', '#BUSY!'],
]

/** `=#REF!` in column P, `=#REF!+1` in column Q — one row per literal. */
export const LITERAL_ADDRS = ERROR_LITERALS.map((_, i) => a1(i, 15))
export const PROPAGATED_ADDRS = ERROR_LITERALS.map((_, i) => a1(i, 16))
export const EXPECTED_LITERAL_DISPLAYS = ERROR_LITERALS.map(([, displayed]) => displayed)

/**
 * Column R — arithmetic operand coercion, one formula per row paired with the
 * display BOTH engines must show. Excel's answers; the TS reference engine
 * (`excel-core-ts/src/eval/coerce.ts` `toNumber` + `evaluate.ts` unary /
 * percent arms) agrees on every row.
 *
 * Rows 1-4 are the numeric-string rule: an operand that is text but LOOKS
 * numeric coerces. Row 5 is the same rule under unary minus. Rows 6-8 are the
 * postfix `%` operator, whose binding is what makes `=-50%` `-0.5` rather than
 * a parse error, and which is NOT modulo — Excel has no modulo operator.
 *
 * Rows 9-10 are the two places where `^` meets the operators that outrank it
 * in Excel's table (unary `-` > `%` > `^`). Both used to be TS-only defects
 * and were fenced out of this file for exactly that reason: `POSTFIX_BP` (55)
 * and `PREFIX_BP` (50) sat BELOW `^`'s left-bp (60), so `=2^2%` left the `%`
 * unconsumed (a parse error) and `=-2^2` answered `-4`. The parser now ranks
 * them 62 / 64 and agrees with the Rust engine, so the rows are pinned rather
 * than described.
 */
export const COERCION_CASES: ReadonlyArray<readonly [formula: string, displayed: string]> = [
  ['=1+"5"', '6'],
  ['="5"*"3"', '15'],
  ['="10"-4', '6'],
  ['=" -5 "+0', '-5'], // surrounding whitespace is trimmed before parsing
  ['=-"5"', '-5'],
  ['=50%', '0.5'],
  ['=-50%', '-0.5'],
  ['=50%%', '0.005'], // stacking is legal in Excel
  ['=2^2%', '1.013959479790029'], // `%` outranks `^`: 2^(2%) = 2^0.02
  ['=-2^2', '4'], // unary `-` outranks `^`: (-2)^2, NOT -(2^2)
]
export const COERCION_ADDRS = COERCION_CASES.map((_, i) => a1(i, 17))
export const EXPECTED_COERCION_DISPLAYS = COERCION_CASES.map(([, displayed]) => displayed)

/**
 * A sixth class: AGGREGATION ERROR TRANSPARENCY — whether an error CELL inside
 * a reference poisons the whole aggregation, or is merely a value the
 * aggregation has its own opinion about.
 *
 * Column T holds one of each value class Excel's counting rules distinguish:
 * three numbers, a text, a boolean, and an error. Excel's rule is per function
 * number, not per SUBTOTAL: an error cell is not a NUMBER (so COUNT skips it)
 * and is not BLANK (so COUNTA tallies it), while SUM and friends do propagate.
 * The Rust engine has always answered that way; the TS reference engine
 * short-circuited on the first error for every code, so `=SUBTOTAL(2, T1:T6)`
 * read `3` on one engine and `#DIV/0!` on the other.
 *
 * The last row is the same rule reached through a different door: a data
 * argument that is a bare error (which is what a single-cell reference to an
 * error cell looks like by the time the implementation sees it) must not
 * short-circuit either — only the FUNCTION-NUMBER argument may.
 */
export const SUBTOTAL_SOURCE: ReadonlyArray<readonly [row: number, kind: 'number' | 'formula', value: string]> = [
  [0, 'number', '1'],
  [1, 'number', '2'],
  [2, 'number', '3'],
  [3, 'formula', '="txt"'],
  [4, 'formula', '=TRUE'],
  [5, 'formula', '=1/0'],
]
export const SUBTOTAL_CASES: ReadonlyArray<readonly [formula: string, displayed: string]> = [
  ['=SUBTOTAL(2,T1:T6)', '3'], // COUNT — numbers only, error skipped
  ['=SUBTOTAL(3,T1:T6)', '6'], // COUNTA — every non-blank, error tallied
  ['=SUBTOTAL(102,T1:T6)', '3'], // the 101-111 tier folds onto the same rule
  ['=SUBTOTAL(103,T1:T6)', '6'],
  ['=SUBTOTAL(9,T1:T6)', '#DIV/0!'], // control: SUM still propagates
  ['=SUBTOTAL(2,T6,T6)', '0'], // bare-error data args do not short-circuit
]
export const SUBTOTAL_ADDRS = SUBTOTAL_CASES.map((_, i) => a1(i, 20))
export const EXPECTED_SUBTOTAL_DISPLAYS = SUBTOTAL_CASES.map(([, displayed]) => displayed)

/**
 * Column V — the same transparency rule reached WITHOUT `SUBTOTAL`. Bare
 * `COUNT` is a separate code path from `SUBTOTAL(2, ...)` on both engines
 * (`forEachCountNumber` vs `runSubtotalFunction` in TS, the `"COUNT"` arm of
 * `eval_call` vs `run_subtotal` in Rust), so pinning one says nothing about
 * the other — the TS `COUNT` went on short-circuiting on the first error cell
 * after the SUBTOTAL codes had already been fixed.
 *
 * `COUNTA` and `SUM` ride the identical fixture as controls. The three
 * answers (skip / tally / propagate) are what "the rule is per function, not
 * per data" means; a scenario that asserted only `COUNT` could not tell a
 * real fix from an engine that had simply stopped propagating everywhere.
 */
export const COUNT_CASES: ReadonlyArray<readonly [formula: string, displayed: string]> = [
  ['=COUNT(T1:T6)', '3'], // an error cell is not a NUMBER → skipped
  ['=COUNTA(T1:T6)', '6'], // ...but it is not BLANK either → tallied
  ['=SUM(T1:T6)', '#DIV/0!'], // control: the value tier still propagates
  // The same three answers when the error is written STRAIGHT INTO the
  // argument list rather than reached through a range. This half outlived the
  // range half by one release: the TS engine still answered `#REF!` here after
  // the range short-circuit was gone, so `=COUNT(A1:A3)` and `=COUNT(#REF!)`
  // contradicted each other on the same engine. There is only one rule — an
  // error is not a number and is not blank — and it does not care how the
  // value arrived.
  ['=COUNT(1,#REF!)', '1'],
  ['=COUNTA(1,#REF!)', '2'],
  ['=SUM(1,#REF!)', '#REF!'], // control again: still propagates
]
export const COUNT_ADDRS = COUNT_CASES.map((_, i) => a1(i, 21))
export const EXPECTED_COUNT_DISPLAYS = COUNT_CASES.map(([, displayed]) => displayed)

/**
 * Column Y — the CRITERIA-tier half of the same question. Column T asks what
 * an aggregate does with an error among the values it is aggregating; this
 * asks what the `*IF` / `*IFS` family does with an error among the cells it is
 * TESTING. They are different tiers of the same function call.
 *
 * Excel skips it, and skips it identically for the single- and multi-criterion
 * forms — there is one criteria semantics, not two. The proof that holds up
 * without a spreadsheet at hand is Exceljet's documented recipe for counting
 * non-error cells, `=COUNTIFS(rng,"<>#N/A",rng,"<>#VALUE!")`: it answers a
 * COUNT over a range that is FULL of errors. Were COUNTIFS short-circuiting on
 * the criteria cell it would answer `#N/A` and the recipe could not exist.
 *
 * This belongs here and not in a single-engine suite because BOTH engines had
 * `COUNTIF` / `SUMIF` right and `COUNTIFS` / `SUMIFS` wrong. Cross-engine
 * equality was green throughout, and so was every per-engine test — they were
 * pinning the defect.
 *
 * The fixture puts its two errors on OPPOSITE rows: `W4` is a criteria cell
 * that fails `">3"`, `X1` is a value cell on the one row `"<5"` does match.
 * The `"<5"` rows are the control — the value tier must still propagate, so
 * "stopped propagating everywhere" cannot satisfy this table either.
 */
export const CRITERIA_CASES: ReadonlyArray<readonly [formula: string, displayed: string]> = [
  ['=COUNTIF(W1:W4,">3")', '2'], // the single-criterion form was always right
  ['=COUNTIFS(W1:W4,">3")', '2'], // ...and the multi-criterion form must agree
  ['=SUMIF(W1:W4,">3",X1:X4)', '50'],
  ['=SUMIFS(X1:X4,W1:W4,">3")', '50'],
  ['=AVERAGEIF(W1:W4,">3",X1:X4)', '25'],
  ['=AVERAGEIFS(X1:X4,W1:W4,">3")', '25'],
  ['=MAXIFS(X1:X4,W1:W4,">3")', '30'],
  ['=MINIFS(X1:X4,W1:W4,">3")', '20'],
  // Control — the VALUE tier still propagates: `"<5"` matches row 1, whose X
  // cell is an error. The Rust `SUMIF` used to drop it and answer `0`, a
  // plausible number that no equality-only assertion could catch.
  ['=SUMIF(W1:W4,"<5",X1:X4)', '#DIV/0!'],
  ['=SUMIFS(X1:X4,W1:W4,"<5")', '#DIV/0!'],
]
export const CRITERIA_ADDRS = CRITERIA_CASES.map((_, i) => a1(i, 24))
export const EXPECTED_CRITERIA_DISPLAYS = CRITERIA_CASES.map(([, displayed]) => displayed)

export const WORKLOAD: WorkloadCell[] = [
  { row: 0, col: 0, kind: 'number', value: 5 }, // A1 — a plain literal
  { row: 0, col: 7, kind: 'formula', value: '=SEQUENCE(10)' }, // H1 → H1:H10
  { row: 0, col: 9, kind: 'formula', value: '=SEQUENCE(4,3)' }, // J1 → J1:L4
  { row: 0, col: 12, kind: 'formula', value: '=1+"x"' }, // M1
  { row: 1, col: 12, kind: 'formula', value: '="x"+"y"' }, // M2
  { row: 2, col: 12, kind: 'formula', value: '=-"abc"' }, // M3
  { row: 0, col: 13, kind: 'formula', value: '=SUBTOTAL("x",A1:A3)' }, // N1
  // Columns T / U — aggregation error transparency, see SUBTOTAL_CASES.
  ...SUBTOTAL_SOURCE.map(([row, kind, value]): WorkloadCell =>
    kind === 'number'
      ? { row, col: 19, kind: 'number', value: Number(value) }
      : { row, col: 19, kind: 'formula', value },
  ),
  ...SUBTOTAL_CASES.map(
    ([formula], row): WorkloadCell => ({ row, col: 20, kind: 'formula', value: formula }),
  ),
  // Column V — bare COUNT / COUNTA / SUM over the same column, see COUNT_CASES.
  ...COUNT_CASES.map(
    ([formula], row): WorkloadCell => ({ row, col: 21, kind: 'formula', value: formula }),
  ),
  // Columns W / X — criteria source and value source for CRITERIA_CASES. The
  // two errors sit on opposite rows: W4 is a CRITERIA cell, X1 a VALUE cell.
  { row: 0, col: 22, kind: 'number', value: 1 },
  { row: 1, col: 22, kind: 'number', value: 5 },
  { row: 2, col: 22, kind: 'number', value: 9 },
  { row: 3, col: 22, kind: 'formula', value: '=1/0' },
  { row: 0, col: 23, kind: 'formula', value: '=1/0' },
  { row: 1, col: 23, kind: 'number', value: 20 },
  { row: 2, col: 23, kind: 'number', value: 30 },
  { row: 3, col: 23, kind: 'number', value: 40 },
  // Column Y — the *IF / *IFS formulas themselves, see CRITERIA_CASES.
  ...CRITERIA_CASES.map(
    ([formula], row): WorkloadCell => ({ row, col: 24, kind: 'formula', value: formula }),
  ),
  // Column R — arithmetic operand coercion + `^` binding, see COERCION_CASES.
  ...COERCION_CASES.map(
    ([formula], row): WorkloadCell => ({ row, col: 17, kind: 'formula', value: formula }),
  ),
  // P1:P13 / Q1:Q13 — one error literal per row, bare then propagated
  // through arithmetic (a token that renders right bare can still leak its
  // internal spelling once an operator short-circuits on it).
  ...ERROR_LITERALS.flatMap(([literal], row): WorkloadCell[] => [
    { row, col: 15, kind: 'formula', value: `=${literal}` },
    { row, col: 16, kind: 'formula', value: `=${literal}+1` },
  ]),
]

export const SPILL_1D = region(0, 7, 10, 1) // H1:H10
export const SPILL_2D = region(0, 9, 4, 3) // J1:L4
export const ERROR_ADDRS = ['M1', 'M2', 'M3']
/** Everything the parity comparisons sample, incl. blanks past each spill. */
export const PROBE_ADDRS = [
  'A1',
  ...SPILL_1D,
  'H11',
  ...SPILL_2D,
  'M9',
  ...ERROR_ADDRS,
  'N1',
  ...LITERAL_ADDRS,
  ...PROPAGATED_ADDRS,
  ...COERCION_ADDRS,
  ...SUBTOTAL_ADDRS,
  ...COUNT_ADDRS,
  ...CRITERIA_ADDRS,
]

export const SEQ_10 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
export const SEQ_4X3 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
// `=SEQUENCE(3,1,100,1)` / `=SEQUENCE(2,2,50,1)` re-pointed onto the anchors.
export const SHRUNK_1D = ['100', '101', '102', '', '', '', '', '', '', '']
export const SHRUNK_2D = ['50', '51', '', '52', '53', '', '', '', '', '', '', '']
// A blocker at H3 withdraws the whole array: anchor `#SPILL!`, ghosts blank,
// the typed value kept verbatim.
export const BLOCKED_1D = ['#SPILL!', '', 'blocker', '', '', '', '', '', '', '']
