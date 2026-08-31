import type {
  ImportCellWire,
  WorkerWorkbookBackendSheet,
  WorkerWorkbookBackendSheetInput,
  WorkerWorkbookClient,
} from '@einfach/solid-excel'

export const demandDrivenSheets: WorkerWorkbookBackendSheetInput[] = [
  { id: 'summary', name: 'Summary' },
  { id: 'model', name: 'Model' },
  { id: 'inputs', name: 'Inputs' },
  { id: 'unused', name: 'Unused' },
]

type SheetIndex = Record<'summary' | 'model' | 'inputs' | 'unused', number>

function cell(
  sheet: number,
  row: number,
  col: number,
  kind: ImportCellWire['kind'],
  value: string | number,
): ImportCellWire {
  return { sheet, row, col, kind, value } as ImportCellWire
}

function summaryCells(sheet: number): ImportCellWire[] {
  return [
    cell(sheet, 0, 0, 'text', 'Visible results'),
    cell(sheet, 1, 0, 'text', 'Metric'),
    cell(sheet, 1, 1, 'text', 'Value'),
    cell(sheet, 2, 0, 'text', 'Revenue'),
    cell(sheet, 2, 1, 'formula', '=Model!B3'),
    cell(sheet, 3, 0, 'text', 'Net Profit'),
    cell(sheet, 3, 1, 'formula', '=Model!B7'),
    cell(sheet, 4, 0, 'text', 'Profit Margin'),
    cell(sheet, 4, 1, 'formula', '=B4/B3'),
    cell(sheet, 6, 0, 'text', 'Evaluation path'),
    cell(sheet, 6, 1, 'text', 'Summary → Model → Inputs'),
    cell(sheet, 7, 0, 'text', 'Not requested'),
    cell(sheet, 7, 1, 'text', '64 formulas on Unused'),
  ]
}

function modelCells(sheet: number): ImportCellWire[] {
  return [
    cell(sheet, 0, 0, 'text', 'Off-screen model'),
    cell(sheet, 1, 0, 'text', 'Metric'),
    cell(sheet, 1, 1, 'text', 'Value'),
    cell(sheet, 2, 0, 'text', 'Revenue'),
    cell(sheet, 2, 1, 'formula', '=Inputs!B3*Inputs!B4'),
    cell(sheet, 3, 0, 'text', 'Cost'),
    cell(sheet, 3, 1, 'formula', '=B3*Inputs!B5'),
    cell(sheet, 4, 0, 'text', 'Gross Profit'),
    cell(sheet, 4, 1, 'formula', '=B3-B4'),
    cell(sheet, 5, 0, 'text', 'Tax'),
    cell(sheet, 5, 1, 'formula', '=B5*Inputs!B6'),
    cell(sheet, 6, 0, 'text', 'Net Profit'),
    cell(sheet, 6, 1, 'formula', '=B5-B6'),
    cell(sheet, 7, 0, 'text', 'Unrequested model formula'),
    cell(sheet, 7, 1, 'formula', '=B4/B3'),
  ]
}

function inputCells(sheet: number): ImportCellWire[] {
  return [
    cell(sheet, 0, 0, 'text', 'Off-screen inputs'),
    cell(sheet, 1, 0, 'text', 'Metric'),
    cell(sheet, 1, 1, 'text', 'Value'),
    cell(sheet, 2, 0, 'text', 'Unit Price'),
    cell(sheet, 2, 1, 'number', 42),
    cell(sheet, 3, 0, 'text', 'Units Sold'),
    cell(sheet, 3, 1, 'number', 1200),
    cell(sheet, 4, 0, 'text', 'Cost Rate'),
    cell(sheet, 4, 1, 'number', 0.35),
    cell(sheet, 5, 0, 'text', 'Tax Rate'),
    cell(sheet, 5, 1, 'number', 0.08),
  ]
}

function unusedCells(sheet: number): ImportCellWire[] {
  const cells = [
    cell(sheet, 0, 0, 'text', 'Loaded, but outside the Summary dependency chain'),
    cell(sheet, 1, 0, 'text', 'Formula'),
    cell(sheet, 1, 1, 'text', 'Evaluates when requested'),
  ]
  for (let row = 2; row < 66; row += 1) {
    cells.push(cell(sheet, row, 0, 'formula', `=${row}+${row}`))
  }
  return cells
}

function sheetIndices(sheets: WorkerWorkbookBackendSheet[]): SheetIndex {
  const byId = new Map(sheets.map((sheet) => [sheet.id, sheet.idx]))
  return {
    summary: byId.get('summary')!,
    model: byId.get('model')!,
    inputs: byId.get('inputs')!,
    unused: byId.get('unused')!,
  }
}

/** Bulk import keeps formula values cold; the first Summary projection pulls its dependency chain. */
export async function seedDemandDrivenWorkbook(
  client: WorkerWorkbookClient,
  sheets: WorkerWorkbookBackendSheet[],
): Promise<void> {
  const index = sheetIndices(sheets)
  const cells = [
    ...summaryCells(index.summary),
    ...modelCells(index.model),
    ...inputCells(index.inputs),
    ...unusedCells(index.unused),
  ]
  const sessionId = await client.beginImport({ mode: 'direct' })
  await client.importChunk(sessionId, cells)
  await client.commitImport(sessionId)
}
