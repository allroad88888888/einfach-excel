/**
 * Seed for the "performance" demo — a 50,000-row × 8-column generated
 * dataset (400,000 data cells) loaded through the worker's chunked
 * import-session API (`beginImport` / `importChunk` / `commitImport`),
 * never through per-cell `setCell` calls (see `seed-formulas.ts` for that
 * pattern, which is fine at ~20 cells but would be ~400,016 RPC round
 * trips here).
 *
 * Mode choice — `direct`, not `atomic`: the WASM worker runtime caps
 * `atomic` import sessions at `MAX_IMPORT_SESSION_NORMALIZED_CELLS`
 * (200,000 cells; see `worker-runtime.ts`) because an atomic commit
 * installs the whole staged batch as one full-sheet replace. `direct`
 * mode has no such session-wide cap — each chunk lands additively in the
 * live workbook via the engine's native `bulk_import_cells` batch call —
 * so it is the only session mode that can reach the ~400k-cell target.
 * The WASM/TS perf bench (`excel/solid-excel/test/perf-ts-vs-wasm-
 * report.md`) measured `bulk_import_cells` on pure-literal batches at
 * 887ms for 500,000 cells in one call; chunked at ~8,000 cells/call the
 * total native cost for this seed's ~400k literal cells should land
 * comfortably under a couple of seconds.
 *
 * Per-row formulas were deliberately NOT used for `revenue`: `direct`
 * mode parses formula text eagerly per chunk (unlike `atomic`, which
 * parks formula text unparsed until commit), and the same perf report
 * shows formula installs are the expensive part of `bulk_import_cells`
 * ("Pasting 100k formulas into a Rust-backed sheet takes ~5s wall-clock").
 * `revenue` is therefore a plain number computed in JS at seed time, and
 * the sheet gets a small header block of *actual* SUM/AVERAGE/COUNTA
 * formulas instead — a handful of formula cells, not 50,000 of them.
 *
 * All values are pure functions of the row index (multiplicative hashes
 * over small primes) — deterministic and stable across reloads, no
 * `Math.random`.
 */
import type {
  ImportCellWire,
  WorkerWorkbookBackendSheet,
  WorkerWorkbookBackendSheetInput,
  WorkerWorkbookClient,
} from '@einfach/solid-excel/vnext'

/** The actual seeded shape — the demo page's header copy reads these, not a guess. */
export const PERFORMANCE_DATA_ROWS = 50_000
export const PERFORMANCE_COLS = 8

const SUMMARY_ROW = 0
const HEADER_ROW = 1
const FIRST_DATA_ROW = 2
const LAST_DATA_ROW = FIRST_DATA_ROW + PERFORMANCE_DATA_ROWS - 1
/** Total sheet extent (0-based row count): 1 summary row + 1 header row + data rows. */
export const PERFORMANCE_SHEET_ROWS = LAST_DATA_ROW + 1

/** Rows per `importChunk` call — `* PERFORMANCE_COLS` stays well under the 10,000-cell wire cap. */
const ROWS_PER_CHUNK = 1000

export const performanceSheets: WorkerWorkbookBackendSheetInput[] = [
  { id: 'data', name: 'Large Dataset' },
]

const CATEGORIES = [
  'Electronics',
  'Apparel',
  'Grocery',
  'Home & Garden',
  'Toys',
  'Sporting Goods',
  'Books',
  'Beauty',
]
const REGIONS = ['North', 'South', 'East', 'West', 'Central']
const CHANNELS = ['Retail', 'Online', 'Wholesale', 'Partner']

function categoryFor(index: number): string {
  return CATEGORIES[index % CATEGORIES.length]
}

function regionFor(index: number): string {
  return REGIONS[index % REGIONS.length]
}

function channelFor(index: number): string {
  return CHANNELS[index % CHANNELS.length]
}

/** Deterministic 5..500 unit count. */
function unitsFor(index: number): number {
  return 5 + ((index * 37 + 11) % 496)
}

/** Deterministic $4.00..$199.99 price. */
function priceFor(index: number): number {
  const dollars = 4 + ((index * 53 + 7) % 196)
  const cents = (index * 17 + 3) % 100
  return Math.round((dollars + cents / 100) * 100) / 100
}

/** Deterministic 40%..80% cost ratio applied to `priceFor`. */
function costFor(index: number): number {
  const ratio = 0.4 + ((index * 29 + 5) % 41) / 100
  return Math.round(priceFor(index) * ratio * 100) / 100
}

function revenueFor(index: number): number {
  return Math.round(unitsFor(index) * priceFor(index) * 100) / 100
}

function colLetter(col: number): string {
  return String.fromCharCode(65 + col)
}

function excelRow(row: number): number {
  return row + 1
}

/** Row 0: a handful of real SUM/AVERAGE/COUNTA formulas over the full data range. */
function summaryRowCells(sheet: number): ImportCellWire[] {
  const from = excelRow(FIRST_DATA_ROW)
  const to = excelRow(LAST_DATA_ROW)
  const idCol = colLetter(0)
  const unitsCol = colLetter(4)
  const priceCol = colLetter(5)
  const revenueCol = colLetter(7)
  return [
    { sheet, row: SUMMARY_ROW, col: 0, kind: 'text', value: 'Total Revenue' },
    {
      sheet,
      row: SUMMARY_ROW,
      col: 1,
      kind: 'formula',
      value: `=SUM(${revenueCol}${from}:${revenueCol}${to})`,
    },
    { sheet, row: SUMMARY_ROW, col: 2, kind: 'text', value: 'Avg Price' },
    {
      sheet,
      row: SUMMARY_ROW,
      col: 3,
      kind: 'formula',
      value: `=AVERAGE(${priceCol}${from}:${priceCol}${to})`,
    },
    { sheet, row: SUMMARY_ROW, col: 4, kind: 'text', value: 'Avg Units' },
    {
      sheet,
      row: SUMMARY_ROW,
      col: 5,
      kind: 'formula',
      value: `=AVERAGE(${unitsCol}${from}:${unitsCol}${to})`,
    },
    { sheet, row: SUMMARY_ROW, col: 6, kind: 'text', value: 'Rows' },
    {
      sheet,
      row: SUMMARY_ROW,
      col: 7,
      kind: 'formula',
      value: `=COUNTA(${idCol}${from}:${idCol}${to})`,
    },
  ]
}

const HEADER_LABELS = ['ID', 'Category', 'Region', 'Channel', 'Units', 'Price', 'Cost', 'Revenue']

function headerRowCells(sheet: number): ImportCellWire[] {
  return HEADER_LABELS.map((label, col) => ({
    sheet,
    row: HEADER_ROW,
    col,
    kind: 'text' as const,
    value: label,
  }))
}

function dataRowCells(sheet: number, row: number, index: number): ImportCellWire[] {
  return [
    { sheet, row, col: 0, kind: 'number', value: index + 1 },
    { sheet, row, col: 1, kind: 'text', value: categoryFor(index) },
    { sheet, row, col: 2, kind: 'text', value: regionFor(index) },
    { sheet, row, col: 3, kind: 'text', value: channelFor(index) },
    { sheet, row, col: 4, kind: 'number', value: unitsFor(index) },
    { sheet, row, col: 5, kind: 'number', value: priceFor(index) },
    { sheet, row, col: 6, kind: 'number', value: costFor(index) },
    { sheet, row, col: 7, kind: 'number', value: revenueFor(index) },
  ]
}

function rowCells(sheet: number, row: number): ImportCellWire[] {
  if (row === SUMMARY_ROW) return summaryRowCells(sheet)
  if (row === HEADER_ROW) return headerRowCells(sheet)
  return dataRowCells(sheet, row, row - FIRST_DATA_ROW)
}

/**
 * `afterInit` seeding callback — plugs straight into
 * `makeWasmWorkerBackend({ sheets: performanceSheets, afterInit: seedPerformanceWorkbook })`.
 * Opens one `direct`-mode import session, streams every grid row through
 * `importChunk` in `ROWS_PER_CHUNK`-sized batches, then commits once.
 */
export async function seedPerformanceWorkbook(
  client: WorkerWorkbookClient,
  sheets: WorkerWorkbookBackendSheet[],
): Promise<void> {
  const sheet = sheets.find((entry) => entry.id === 'data')?.idx ?? 0

  const sessionId = await client.beginImport({ mode: 'direct' })
  let buffer: ImportCellWire[] = []
  for (let row = 0; row < PERFORMANCE_SHEET_ROWS; row++) {
    buffer.push(...rowCells(sheet, row))
    const atChunkBoundary = (row + 1) % ROWS_PER_CHUNK === 0
    const atLastRow = row === PERFORMANCE_SHEET_ROWS - 1
    if (atChunkBoundary || atLastRow) {
      await client.importChunk(sessionId, buffer)
      buffer = []
    }
  }
  await client.commitImport(sessionId)
}
