/**
 * scale-parity 的**确定性工作负载**：把 `WORKLOAD_SEED` 展开成一份 ~75k 单元格的
 * 三表工作簿，外加 500 个采样地址与几个闭式期望值。
 *
 * 只负责"生成输入"—— 不认识任何引擎，不做任何断言。P2 的编辑序列在
 * `scale-parity-edits.ts`，引擎驱动在 `scale-parity-engines.ts`。
 */
import { a1, makeRng, rngInt } from './parity-seed'

// ---------------------------------------------------------------------------
// 种子。改任何一个都会换掉整份工作负载 —— 保持稳定，报告出来的分歧才能复现。
// ---------------------------------------------------------------------------
export const WORKLOAD_SEED = 0x5ca1ab1e
const SAMPLE_SEED = 0x5a401e5

// ---------------------------------------------------------------------------
// Workload definition — built ONCE; both engines consume the same object.
//
// Sheets: Sheet1 / Sheet2 / Sheet3.
//
// Primitives (50,000):
//   Sheet1 A1:A20000  numbers  (LCG 0..999)
//   Sheet1 B1:B3000   text     (`t<n>-<lcg>`)
//   Sheet1 C1:C2000   booleans
//   Sheet2 A1:A15000  numbers
//   Sheet3 A1:A10000  numbers
//
// Formulas (~25,000):
//   Sheet1 D1:D10000  50/50 `=Ax+Ay` | `=IF(Ax>500,Ax*2,Ax-1)`
//   Sheet1 E1:E5000   bounded SUMIF windows `=SUMIF(Alo:Ahi,">500")`
//   Sheet2 B1:B5000   cross-sheet `=Sheet1!Ax*2`
//   Sheet3 B1:B5000   chains in 50-cell blocks (`=B(r-1)+1`, head `=A(r)+0`)
//   Specials: whole-col aggregates, cross-sheet aggregate, SEQUENCE spills,
//             deliberate error formulas (see SPECIALS below).
// ---------------------------------------------------------------------------
export const SHEET_NAMES = ['Sheet1', 'Sheet2', 'Sheet3']
export const S1_NUMS = 20_000
export const S1_TEXTS = 3_000
export const S1_BOOLS = 2_000
export const S2_NUMS = 15_000
export const S3_NUMS = 10_000
export const S1_BINOPS = 10_000
export const S1_SUMIFS = 5_000
export const S2_XSHEET = 5_000
export const S3_CHAIN = 5_000
export const CHAIN_BLOCK = 50

interface WorkloadCellNumber {
  sheet: number
  row: number
  col: number
  kind: 'number'
  value: number
}
interface WorkloadCellText {
  sheet: number
  row: number
  col: number
  kind: 'text'
  value: string
}
interface WorkloadCellBoolean {
  sheet: number
  row: number
  col: number
  kind: 'boolean'
  value: boolean
}
interface WorkloadCellFormula {
  sheet: number
  row: number
  col: number
  kind: 'formula'
  value: string
}
export type WorkloadCell =
  | WorkloadCellNumber
  | WorkloadCellText
  | WorkloadCellBoolean
  | WorkloadCellFormula

export interface CellRef {
  sheet: number
  addr: string
}

export interface Workload {
  cells: WorkloadCell[]
  /** 500 deterministic sample refs (incl. specials, spill targets, errors, empties). */
  sampleRefs: CellRef[]
  /** Formula cells NOT in the sample set, reserved for the never-read probe. */
  probeRefs: { neverRead: CellRef; literal: CellRef }
  /** Closed form: sum of the Sheet1 A-column seed values. */
  sheet1ColASum: number
  /** Count of Sheet1 A-column cells (closed form for the P4 clear counter). */
  sheet1ColACount: number
  /** Addresses covered by spill regions (anchors + targets), per sheet. */
  spillRegionRefs: CellRef[]
}

// Specials — fixed addresses (zero-based row/col), all on top of the bulk
// columns above. Kept OUT of the LCG columns so nothing overwrites them.
const SPECIALS: WorkloadCellFormula[] = [
  // Whole-column aggregates (sparse fan-in at scale).
  { sheet: 0, row: 0, col: 6, kind: 'formula', value: '=SUM(A:A)' }, // Sheet1!G1
  { sheet: 0, row: 1, col: 6, kind: 'formula', value: '=SUMIF(A:A,">500")' }, // Sheet1!G2
  { sheet: 0, row: 2, col: 6, kind: 'formula', value: '=COUNTIF(A:A,"<200")' }, // Sheet1!G3
  { sheet: 1, row: 0, col: 2, kind: 'formula', value: '=SUM(A:A)' }, // Sheet2!C1
  { sheet: 2, row: 0, col: 2, kind: 'formula', value: '=SUM(A:A)' }, // Sheet3!C1
  // Cross-sheet aggregate.
  {
    sheet: 1,
    row: 1,
    col: 2,
    kind: 'formula',
    value: '=SUM(Sheet1!A1:A1000)+SUM(A1:A1000)', // Sheet2!C2
  },
  // Spill anchors (dynamic arrays).
  { sheet: 0, row: 0, col: 7, kind: 'formula', value: '=SEQUENCE(10)' }, // Sheet1!H1 → H1:H10
  { sheet: 0, row: 0, col: 9, kind: 'formula', value: '=SEQUENCE(4,3)' }, // Sheet1!J1 → J1:L4
  { sheet: 1, row: 0, col: 3, kind: 'formula', value: '=SEQUENCE(8)' }, // Sheet2!D1 → D1:D8
  { sheet: 2, row: 0, col: 3, kind: 'formula', value: '=SEQUENCE(5,2)' }, // Sheet3!D1 → D1:E5
  // Deliberate error formulas.
  { sheet: 0, row: 0, col: 12, kind: 'formula', value: '=1/0' }, // Sheet1!M1 → #DIV/0!
  { sheet: 0, row: 1, col: 12, kind: 'formula', value: '=NOSUCHFN_PARITY(1)' }, // Sheet1!M2 → #NAME?
  { sheet: 0, row: 2, col: 12, kind: 'formula', value: '=SQRT(-1)' }, // Sheet1!M3 → #NUM!
  { sheet: 0, row: 3, col: 12, kind: 'formula', value: '=1+"x"' }, // Sheet1!M4 → #VALUE!
]

// Spill regions implied by the SPECIALS above (anchor + targets).
function spillRegions(): CellRef[] {
  const out: CellRef[] = []
  const push = (sheet: number, row0: number, col0: number, rows: number, cols: number) => {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        out.push({ sheet, addr: a1(row0 + r, col0 + c) })
      }
    }
  }
  push(0, 0, 7, 10, 1) // Sheet1 H1:H10
  push(0, 0, 9, 4, 3) // Sheet1 J1:L4
  push(1, 0, 3, 8, 1) // Sheet2 D1:D8
  push(2, 0, 3, 5, 2) // Sheet3 D1:E5
  return out
}

export function buildWorkload(): Workload {
  const rng = makeRng(WORKLOAD_SEED)
  const cells: WorkloadCell[] = []

  // --- primitives ---------------------------------------------------------
  let sheet1ColASum = 0
  for (let r = 0; r < S1_NUMS; r += 1) {
    const v = rngInt(rng, 1000)
    sheet1ColASum += v
    cells.push({ sheet: 0, row: r, col: 0, kind: 'number', value: v })
  }
  for (let r = 0; r < S1_TEXTS; r += 1) {
    cells.push({ sheet: 0, row: r, col: 1, kind: 'text', value: `t${r}-${rngInt(rng, 100)}` })
  }
  for (let r = 0; r < S1_BOOLS; r += 1) {
    cells.push({ sheet: 0, row: r, col: 2, kind: 'boolean', value: rng() < 0.5 })
  }
  for (let r = 0; r < S2_NUMS; r += 1) {
    cells.push({ sheet: 1, row: r, col: 0, kind: 'number', value: rngInt(rng, 1000) })
  }
  for (let r = 0; r < S3_NUMS; r += 1) {
    cells.push({ sheet: 2, row: r, col: 0, kind: 'number', value: rngInt(rng, 1000) })
  }

  // --- formulas ------------------------------------------------------------
  // Sheet1 D: binop / IF mix over the A column.
  for (let r = 0; r < S1_BINOPS; r += 1) {
    if (rng() < 0.5) {
      const x = rngInt(rng, S1_NUMS)
      const y = rngInt(rng, S1_NUMS)
      cells.push({
        sheet: 0,
        row: r,
        col: 3,
        kind: 'formula',
        value: `=${a1(x, 0)}+${a1(y, 0)}`,
      })
    } else {
      const x = rngInt(rng, S1_NUMS)
      cells.push({
        sheet: 0,
        row: r,
        col: 3,
        kind: 'formula',
        value: `=IF(${a1(x, 0)}>500,${a1(x, 0)}*2,${a1(x, 0)}-1)`,
      })
    }
  }
  // Sheet1 E: bounded SUMIF windows (1,000-cell windows over A).
  for (let r = 0; r < S1_SUMIFS; r += 1) {
    const lo = rngInt(rng, S1_NUMS - 1000)
    cells.push({
      sheet: 0,
      row: r,
      col: 4,
      kind: 'formula',
      value: `=SUMIF(${a1(lo, 0)}:${a1(lo + 999, 0)},">500")`,
    })
  }
  // Sheet2 B: cross-sheet point refs into Sheet1.
  for (let r = 0; r < S2_XSHEET; r += 1) {
    const x = rngInt(rng, S1_NUMS)
    cells.push({ sheet: 1, row: r, col: 1, kind: 'formula', value: `=Sheet1!${a1(x, 0)}*2` })
  }
  // Sheet3 B: 50-deep chains (block head re-roots on the A column so a
  // single block stays a bounded dependency chain on both engines).
  for (let r = 0; r < S3_CHAIN; r += 1) {
    cells.push({
      sheet: 2,
      row: r,
      col: 1,
      kind: 'formula',
      value: r % CHAIN_BLOCK === 0 ? `=${a1(r, 0)}+0` : `=${a1(r - 1, 1)}+1`,
    })
  }
  cells.push(...SPECIALS)

  // --- deterministic samples ------------------------------------------------
  const spillRefs = spillRegions()
  const sampleRefs: CellRef[] = []
  const seen = new Set<string>()
  const addRef = (ref: CellRef) => {
    const key = `${ref.sheet}:${ref.addr}`
    if (seen.has(key)) return
    seen.add(key)
    sampleRefs.push(ref)
  }
  // Specials, full spill regions, and a blank just outside each spill edge.
  for (const s of SPECIALS) addRef({ sheet: s.sheet, addr: a1(s.row, s.col) })
  for (const ref of spillRefs) addRef(ref)
  addRef({ sheet: 0, addr: 'H11' }) // one past Sheet1!H1 spill
  addRef({ sheet: 1, addr: 'D9' }) // one past Sheet2!D1 spill
  // A handful of definitely-empty cells.
  addRef({ sheet: 0, addr: 'AZ99999' })
  addRef({ sheet: 1, addr: 'Q42' })
  addRef({ sheet: 2, addr: 'XFD1048576' })
  // Chain tails (closed-form-ish: head + 49).
  for (let b = 0; b < S3_CHAIN; b += CHAIN_BLOCK * 10) {
    addRef({ sheet: 2, addr: a1(b + CHAIN_BLOCK - 1, 1) })
  }
  // Fill to 500 by LCG over the workload cells. Reserve the LAST formula
  // rows of Sheet1 D / E for the never-read probe pool by skipping them.
  const sampleRng = makeRng(SAMPLE_SEED)
  while (sampleRefs.length < 500) {
    const cell = cells[rngInt(sampleRng, cells.length)]
    if (cell.sheet === 0 && cell.col === 3 && cell.row >= S1_BINOPS - 10) continue
    addRef({ sheet: cell.sheet, addr: a1(cell.row, cell.col) })
  }

  return {
    cells,
    sampleRefs,
    probeRefs: {
      // Reserved above — never read through any sampling pass.
      neverRead: { sheet: 0, addr: a1(S1_BINOPS - 1, 3) },
      literal: { sheet: 0, addr: 'A1' },
    },
    sheet1ColASum,
    sheet1ColACount: S1_NUMS,
    spillRegionRefs: spillRefs,
  }
}
