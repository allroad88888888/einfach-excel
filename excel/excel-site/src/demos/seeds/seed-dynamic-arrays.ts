/**
 * Seed for the "dynamic-arrays" demo — a small sales-by-region source table
 * (A1:B9) plus three spill anchors that each read it: `UNIQUE` (D2),
 * `SORT` descending (F2), and `FILTER` on Sales > 250 (H2). Dynamic-array
 * spill is implemented by the excel-core-ts worker runtime (Wave E1): a
 * formula evaluating to an array `Value` spills from its anchor cell into
 * the empty cells around it, and editing a source cell re-evaluates the
 * anchor so the spilled block reflows — see
 * `excel/solid-excel/test/excel-core-ts-spill.test.ts` for the underlying
 * contract this seed exercises through the real worker RPC path (not a
 * mock). Cells are written one RPC at a time via `WorkerWorkbookClient`,
 * matching `seedFormulasWorkbook`.
 */
import type {
  WorkerWorkbookBackendSheet,
  WorkerWorkbookBackendSheetInput,
  WorkerWorkbookClient,
} from '@einfach/solid-excel/vnext'

/** Sheet list passed straight to `makeTsWorkerBackend({ sheets: ... })`. */
export const dynamicArraysSheets: WorkerWorkbookBackendSheetInput[] = [
  { id: 'data', name: 'Sales' },
]

function text(client: WorkerWorkbookClient, sheet: number, addr: string, value: string) {
  return client.setCell(sheet, addr, { type: 'text', value })
}

function num(client: WorkerWorkbookClient, sheet: number, addr: string, value: number) {
  return client.setCell(sheet, addr, { type: 'number', value })
}

function formula(client: WorkerWorkbookClient, sheet: number, addr: string, source: string) {
  return client.setFormulaDetailed(sheet, addr, source)
}

// Row order matters: FILTER preserves it, UNIQUE dedupes by first
// appearance, SORT reorders it independently — three different views of
// the same 8 source rows.
const REGIONS = ['North', 'South', 'North', 'East', 'South', 'North', 'East', 'South']
const SALES = [120, 340, 95, 410, 275, 180, 300, 150]

/**
 * `afterInit` seeding callback — same shape as
 * `WorkerWorkbookSpreadsheetBackendOptions['afterInit']`, so it plugs
 * straight into
 * `makeTsWorkerBackend({ sheets: dynamicArraysSheets, afterInit: seedDynamicArraysWorkbook })`.
 */
export async function seedDynamicArraysWorkbook(
  client: WorkerWorkbookClient,
  sheets: WorkerWorkbookBackendSheet[],
): Promise<void> {
  const idxById = new Map(sheets.map((sheet) => [sheet.id, sheet.idx]))
  const s = idxById.get('data')!

  // Source table — nothing here is a formula, so editing any cell is a
  // plain value write that re-triggers the three anchors below.
  await text(client, s, 'A1', 'Region')
  await text(client, s, 'B1', 'Sales')
  for (let i = 0; i < REGIONS.length; i += 1) {
    await text(client, s, `A${i + 2}`, REGIONS[i])
    await num(client, s, `B${i + 2}`, SALES[i])
  }

  // Anchor 1 — UNIQUE spills a single column of distinct regions.
  await text(client, s, 'D1', 'Unique regions')
  await formula(client, s, 'D2', '=UNIQUE(A2:A9)')

  // Anchor 2 — SORT spills the full 8-value Sales column, descending.
  await text(client, s, 'F1', 'Sales, sorted')
  await formula(client, s, 'F2', '=SORT(B2:B9, 1, -1)')

  // Anchor 3 — FILTER spills a 2-column block: rows kept, order preserved.
  await text(client, s, 'H1', 'Region')
  await text(client, s, 'I1', 'Sales > 250')
  await formula(client, s, 'H2', '=FILTER(A2:B9, B2:B9>250)')
}
