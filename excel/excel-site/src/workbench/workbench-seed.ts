/**
 * Workbench seed — data foundation for the flagship `/workbench` page.
 * Three sheets: Overview (regional revenue), Forecast (a growth projection
 * that genuinely reads Overview + Assumptions cross-sheet), Assumptions (the
 * parameters Forecast reads). Backed by `worker-wasm` (real Rust/WASM
 * engine), not the static backend — the static evaluator's formula parser
 * has no `SheetName!A1` support at all (verified against
 * `static-formula-eval.ts`: no `!` token, single-sheet cell lookup), so a
 * flagship page depending on live cross-sheet formulas needs the worker.
 *
 * Seeding shape mirrors `seed-formulas.ts` + `FormulasDemo.tsx` exactly:
 * `workbenchSheets` goes to `makeWasmWorkerBackend({ sheets, afterInit })`,
 * and `seedWorkbenchWorkbook` is the `afterInit` callback that writes every
 * cell one RPC at a time via `WorkerWorkbookClient` (`setCell` for literals,
 * `setFormulaDetailed` for formulas) — there is no bulk "seed" entry point
 * on this client, and no separate static-only plumbing needed since the
 * worker path seeds all three sheets uniformly (no sheets[0]-only limit).
 *
 * Formats: `client.setFormatRange` is a REQUIRED (non-optional) method on
 * `WorkerWorkbookClient` (worker-protocol.ts), and the WASM runtime
 * genuinely implements it (`worker-runtime.ts` `case 'setFormatRange'` calls
 * the real `wb.set_format_range`) — confirmed supported, applied below.
 */
import type {
  WorkerWorkbookBackendSheet,
  WorkerWorkbookBackendSheetInput,
  WorkerWorkbookClient,
} from '@einfach/solid-excel/vnext'
import type { SpreadsheetCellFormat } from '@einfach/spreadsheet-ui-core'

/** Sheet ids double as display names — both the nav target and header copy. */
export const OVERVIEW_SHEET = 'Overview'
export const FORECAST_SHEET = 'Forecast'
export const ASSUMPTIONS_SHEET = 'Assumptions'

export const workbenchSheets: WorkerWorkbookBackendSheetInput[] = [
  { id: OVERVIEW_SHEET, name: OVERVIEW_SHEET },
  { id: FORECAST_SHEET, name: FORECAST_SHEET },
  { id: ASSUMPTIONS_SHEET, name: ASSUMPTIONS_SHEET },
]

const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

type CellWrite = readonly [addr: string, kind: 'text' | 'number' | 'formula', value: string | number]

async function writeCells(
  client: WorkerWorkbookClient,
  sheet: number,
  writes: readonly CellWrite[],
): Promise<void> {
  for (const [addr, kind, value] of writes) {
    if (kind === 'formula') await client.setFormulaDetailed(sheet, addr, String(value))
    else if (kind === 'number') await client.setCell(sheet, addr, { type: 'number', value: Number(value) })
    else await client.setCell(sheet, addr, { type: 'text', value: String(value) })
  }
}

// Overview (0-indexed row : Excel row) — 0:1 title, 1:2 subtitle, 3:4 KPI
// strip, 5:6 header row, 6-11:7-12 six regions, 13:14 totals row. Columns:
// A Region B Owner C-F Q1-Q4 G Full-Year H Target I Attainment% J Status.
type OverviewRegion = readonly [
  region: string, owner: string, q1: number, q2: number, q3: number, q4: number,
  target: number, status: string,
]

const OVERVIEW_REGIONS: readonly OverviewRegion[] = [
  ['North America', 'J. Reyes', 540_000, 620_000, 690_000, 760_000, 2_450_000, 'Leading'],
  ['EMEA', 'A. Novak', 430_000, 510_000, 580_000, 650_000, 2_180_000, 'Stable'],
  ['APAC', 'M. Tanaka', 380_000, 450_000, 520_000, 590_000, 2_060_000, 'Stable'],
  ['LATAM', 'C. Silva', 290_000, 350_000, 410_000, 480_000, 1_760_000, 'Watch'],
  ['Enterprise', 'R. Chen', 620_000, 710_000, 820_000, 940_000, 2_900_000, 'Leading'],
  ['SMB', 'T. Brooks', 510_000, 570_000, 640_000, 720_000, 2_380_000, 'Leading'],
]

/** 0-indexed row of the first region; data runs for `OVERVIEW_REGIONS.length` rows. */
const OVERVIEW_DATA_ROW = 6

const OVERVIEW_HEADERS = [
  'Region', 'Owner', 'Q1', 'Q2', 'Q3', 'Q4', 'Full-Year', 'Target', 'Attainment %', 'Status',
]

function overviewRegionWrites(entry: OverviewRegion, index: number): CellWrite[] {
  const r = OVERVIEW_DATA_ROW + index + 1 // Excel row (1-indexed)
  const [region, owner, q1, q2, q3, q4, target, status] = entry
  return [
    [`A${r}`, 'text', region], [`B${r}`, 'text', owner],
    [`C${r}`, 'number', q1], [`D${r}`, 'number', q2], [`E${r}`, 'number', q3], [`F${r}`, 'number', q4],
    [`G${r}`, 'formula', `=SUM(C${r}:F${r})`], [`H${r}`, 'number', target],
    [`I${r}`, 'formula', `=G${r}/H${r}`], [`J${r}`, 'text', status],
  ]
}

const overviewWrites: readonly CellWrite[] = [
  ['A1', 'text', '2026 Growth Operating Model'],
  ['A2', 'text', 'Regional revenue vs. target · FY2026'],
  ['A4', 'text', 'Annual Revenue'], ['B4', 'formula', '=SUM(G7:G12)'],
  ['D4', 'text', 'Avg Attainment'], ['E4', 'formula', '=AVERAGE(I7:I12)'],
  ['G4', 'text', 'Leading Regions'], ['H4', 'formula', '=COUNTIF(J7:J12,"Leading")'],
  ...OVERVIEW_HEADERS.map((label, i) => [`${COLS[i]}6`, 'text', label] as CellWrite),
  ...OVERVIEW_REGIONS.flatMap(overviewRegionWrites),
  ['A14', 'text', 'Total'],
  ...['C', 'D', 'E', 'F', 'G', 'H'].map((c) => [`${c}14`, 'formula', `=SUM(${c}7:${c}12)`] as CellWrite),
  ['I14', 'formula', '=AVERAGE(I7:I12)'],
]

// Forecast (0-indexed row : Excel row) — 0:1 title, 1:2 subtitle, 3:4
// baseline (B4 = "=Overview!G14", REAL cross-sheet ref to the Total row's
// Full-Year column), 4:5 growth rate (B5 = "=Assumptions!B5", REAL
// cross-sheet), 6:7 header row, 7-9:8-10 three scenarios projecting FY2027
// off that baseline/rate.
type ForecastScenario = readonly [name: string, multiplier: number, confidence: number]

const FORECAST_SCENARIOS: readonly ForecastScenario[] = [
  ['Conservative', 0.5, 0.9],
  ['Base Case', 1, 0.75],
  ['Aggressive', 1.5, 0.55],
]

function forecastScenarioWrites(entry: ForecastScenario, index: number): CellWrite[] {
  const r = 8 + index // Excel row
  const [name, multiplier, confidence] = entry
  return [
    [`A${r}`, 'text', name],
    [`B${r}`, 'number', multiplier],
    [`C${r}`, 'formula', `=$B$4*(1+$B$5*B${r})`],
    [`D${r}`, 'formula', `=C${r}-$B$4`],
    [`E${r}`, 'number', confidence],
  ]
}

const FORECAST_HEADERS = ['Scenario', 'Growth Multiplier', 'FY2027 Projection', 'vs. FY2026', 'Confidence']

const forecastWrites: readonly CellWrite[] = [
  ['A1', 'text', 'FY2027 Growth Forecast'],
  ['A2', 'text', 'Scenario projections from the FY2026 total and the Assumptions growth rate'],
  ['A4', 'text', 'FY2026 Total Revenue (baseline)'], ['B4', 'formula', '=Overview!G14'],
  ['A5', 'text', 'Growth Rate (Annual)'], ['B5', 'formula', '=Assumptions!B5'],
  ...FORECAST_HEADERS.map((label, i) => [`${COLS[i]}7`, 'text', label] as CellWrite),
  ...FORECAST_SCENARIOS.flatMap(forecastScenarioWrites),
]

// Assumptions (0-indexed row : Excel row) — 0:1 title, 1:2 subtitle, 3:4
// header row, 4-8:5-9 five parameters, Growth Rate first (B5 = 0.08, read
// cross-sheet by Forecast!B5).
type AssumptionRow = readonly [name: string, value: number, unit: string, note: string]

const ASSUMPTIONS: readonly AssumptionRow[] = [
  ['Growth Rate (Annual)', 0.08, '%', 'Read by Forecast!B5'],
  ['Tax Rate', 0.21, '%', 'Applied to net income projections'],
  ['Renewal Rate', 0.84, '%', 'Trailing 12-month average'],
  ['Sales Cycle', 42, 'days', 'Lead to close'],
  ['Annual Growth Target', 0.15, '%', 'Leadership target for FY2027'],
]

const ASSUMPTIONS_HEADERS = ['Parameter', 'Value', 'Unit', 'Notes']

function assumptionRowWrites(entry: AssumptionRow, index: number): CellWrite[] {
  const r = 5 + index // Excel row
  const [name, value, unit, note] = entry
  return [[`A${r}`, 'text', name], [`B${r}`, 'number', value], [`C${r}`, 'text', unit], [`D${r}`, 'text', note]]
}

const assumptionsWrites: readonly CellWrite[] = [
  ['A1', 'text', 'Model Assumptions'],
  ['A2', 'text', 'Parameters read by the Forecast sheet'],
  ...ASSUMPTIONS_HEADERS.map((label, i) => [`${COLS[i]}4`, 'text', label] as CellWrite),
  ...ASSUMPTIONS.flatMap(assumptionRowWrites),
]

const titleFormat: SpreadsheetCellFormat = { bold: true, fontSize: 16 }
const subtitleFormat: SpreadsheetCellFormat = { italic: true, fgColor: '#5b6b64' }
const headerFormat: SpreadsheetCellFormat = { bold: true, align: 'center', bgColor: '#eaf3ee' }
const currencyFormat: SpreadsheetCellFormat = {
  numberFormat: { kind: 'currency', symbol: '$', digits: 0 },
  align: 'right',
}
const percentFormat: SpreadsheetCellFormat = {
  numberFormat: { kind: 'percent', digits: 1 },
  align: 'right',
}

/** `[sheetId, rowStart, rowEnd, colStart, colEnd, format]`, all rows/cols 0-indexed. */
type FormatSpec = readonly [string, number, number, number, number, SpreadsheetCellFormat]

const FORMAT_SPECS: readonly FormatSpec[] = [
  [OVERVIEW_SHEET, 0, 0, 0, 0, titleFormat],
  [OVERVIEW_SHEET, 1, 1, 0, 0, subtitleFormat],
  [OVERVIEW_SHEET, 5, 5, 0, 9, headerFormat],
  [OVERVIEW_SHEET, 3, 3, 1, 1, currencyFormat],
  [OVERVIEW_SHEET, 6, 11, 2, 7, currencyFormat],
  [OVERVIEW_SHEET, 13, 13, 2, 7, currencyFormat],
  [OVERVIEW_SHEET, 3, 3, 4, 4, percentFormat],
  [OVERVIEW_SHEET, 6, 11, 8, 8, percentFormat],
  [OVERVIEW_SHEET, 13, 13, 8, 8, percentFormat],
  [FORECAST_SHEET, 0, 0, 0, 0, titleFormat],
  [FORECAST_SHEET, 1, 1, 0, 0, subtitleFormat],
  [FORECAST_SHEET, 6, 6, 0, 4, headerFormat],
  [FORECAST_SHEET, 3, 3, 1, 1, currencyFormat],
  [FORECAST_SHEET, 7, 9, 2, 3, currencyFormat],
  [FORECAST_SHEET, 4, 4, 1, 1, percentFormat],
  [FORECAST_SHEET, 7, 9, 4, 4, percentFormat],
  [ASSUMPTIONS_SHEET, 0, 0, 0, 0, titleFormat],
  [ASSUMPTIONS_SHEET, 1, 1, 0, 0, subtitleFormat],
  [ASSUMPTIONS_SHEET, 3, 3, 0, 3, headerFormat],
  [ASSUMPTIONS_SHEET, 4, 6, 1, 1, percentFormat],
  [ASSUMPTIONS_SHEET, 8, 8, 1, 1, percentFormat],
]

/**
 * `afterInit` seeding callback — plugs straight into
 * `makeWasmWorkerBackend({ sheets: workbenchSheets, afterInit: seedWorkbenchWorkbook })`,
 * same shape as `seedFormulasWorkbook` in `seed-formulas.ts`. Looks sheet
 * indices up by the ids declared in `workbenchSheets` (not array order), and
 * applies every `FORMAT_SPECS` range last, after all three sheets' cells
 * exist.
 */
export async function seedWorkbenchWorkbook(
  client: WorkerWorkbookClient,
  sheets: WorkerWorkbookBackendSheet[],
): Promise<void> {
  const idxById = new Map(sheets.map((sheet) => [sheet.id, sheet.idx]))
  const overview = idxById.get(OVERVIEW_SHEET)!
  const forecast = idxById.get(FORECAST_SHEET)!
  const assumptions = idxById.get(ASSUMPTIONS_SHEET)!

  await writeCells(client, overview, overviewWrites)
  await writeCells(client, forecast, forecastWrites)
  await writeCells(client, assumptions, assumptionsWrites)

  for (const [sheetId, rowStart, rowEnd, colStart, colEnd, format] of FORMAT_SPECS) {
    const sheet = idxById.get(sheetId)!
    await client.setFormatRange(
      { sheet, startRow: rowStart, endRow: rowEnd, startCol: colStart, endCol: colEnd },
      format,
    )
  }
}

/**
 * Coordinate contract for the workbench tour + page copy — cross-check every
 * entry against the cell blocks above before touching either side.
 */
export const WB = {
  /** Sheet id AND display name — the two are identical on this seed. */
  overviewSheetName: OVERVIEW_SHEET,
  forecastSheetName: FORECAST_SHEET,
  assumptionsSheetName: ASSUMPTIONS_SHEET,

  // Tour step 1: North America's Full-Year SUM — formula bar reads "=SUM(C7:F7)".
  sumFormulaCell: { sheetId: OVERVIEW_SHEET, a1: 'G7', row: 6, col: 6 },
  // Tour step 2: the Q1-Q4 block across all six regions — status bar shows Sum/Average/Count.
  aggregateRange: { sheetId: OVERVIEW_SHEET, start: 'C7', end: 'F12' },
  // Tour step 3: North America Q1 — editing it recalcs G7, the Total row (14), and the KPI strip (B4/E4).
  editCell: { sheetId: OVERVIEW_SHEET, a1: 'C7', row: 6, col: 2 },
  // Tour step 4: REAL cross-sheet formula — Forecast!B4 reads "=Overview!G14"
  // (the Total row's Full-Year column). Recalcs when Overview!G14 changes.
  crossSheetCell: { sheetId: FORECAST_SHEET, a1: 'B4', row: 3, col: 1 },
  // Overview KPI strip.
  kpiRevenueCell: { sheetId: OVERVIEW_SHEET, a1: 'B4', row: 3, col: 1 }, // "=SUM(G7:G12)", $13.78M
  kpiAttainmentCell: { sheetId: OVERVIEW_SHEET, a1: 'E4', row: 3, col: 4 }, // "=AVERAGE(I7:I12)"
  kpiLeadingCell: { sheetId: OVERVIEW_SHEET, a1: 'H4', row: 3, col: 7 }, // COUNTIF(J7:J12,"Leading")
  overviewHeaderRow: 5, // 0-indexed header row (Region/Owner/…/Status), Excel row 6
  overviewDataRowStart: OVERVIEW_DATA_ROW, // first region row, 0-indexed (Excel row 7)
  overviewDataRowEnd: OVERVIEW_DATA_ROW + OVERVIEW_REGIONS.length - 1, // last region row (Excel row 12)
  overviewTotalsCell: { sheetId: OVERVIEW_SHEET, a1: 'A14', row: 13, col: 0 }, // "Total" label
  // Same cell as crossSheetCell — the baseline IS the cross-sheet formula now.
  forecastBaselineCell: { sheetId: FORECAST_SHEET, a1: 'B4', row: 3, col: 1 }, // "=Overview!G14"
  forecastGrowthRateCell: { sheetId: FORECAST_SHEET, a1: 'B5', row: 4, col: 1 }, // "=Assumptions!B5"
  assumptionsGrowthRateCell: { sheetId: ASSUMPTIONS_SHEET, a1: 'B5', row: 4, col: 1 }, // source Forecast!B5 reads
} as const
