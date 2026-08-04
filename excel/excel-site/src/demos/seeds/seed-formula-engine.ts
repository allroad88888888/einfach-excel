import type {
  WorkerWorkbookBackendSheet,
  WorkerWorkbookBackendSheetInput,
  WorkerWorkbookClient,
} from '@einfach/solid-excel/vnext'

export const formulaEngineSheets: WorkerWorkbookBackendSheetInput[] = [
  { id: 'inputs', name: 'Inputs' },
  { id: 'model', name: 'Model' },
  { id: 'summary', name: 'Summary' },
]

function text(client: WorkerWorkbookClient, sheet: number, address: string, value: string) {
  return client.setCell(sheet, address, { type: 'text', value })
}

function number(client: WorkerWorkbookClient, sheet: number, address: string, value: number) {
  return client.setCell(sheet, address, { type: 'number', value })
}

function formula(client: WorkerWorkbookClient, sheet: number, address: string, value: string) {
  return client.setFormulaDetailed(sheet, address, value)
}

/** Seeds Inputs → Model → Summary to make the cross-sheet dependency chain inspectable. */
export async function seedFormulaEngineWorkbook(
  client: WorkerWorkbookClient,
  sheets: WorkerWorkbookBackendSheet[],
): Promise<void> {
  const sheetsById = new Map(sheets.map((sheet) => [sheet.id, sheet.idx]))
  const inputs = sheetsById.get('inputs')!
  const model = sheetsById.get('model')!
  const summary = sheetsById.get('summary')!

  await text(client, inputs, 'A1', 'Inputs')
  await text(client, inputs, 'A2', 'Metric')
  await text(client, inputs, 'B2', 'Value')
  await text(client, inputs, 'A3', 'Unit Price ($)')
  await number(client, inputs, 'B3', 42)
  await text(client, inputs, 'A4', 'Units Sold')
  await number(client, inputs, 'B4', 1200)
  await text(client, inputs, 'A5', 'Cost Rate')
  await number(client, inputs, 'B5', 0.35)
  await text(client, inputs, 'A6', 'Tax Rate')
  await number(client, inputs, 'B6', 0.08)

  await text(client, model, 'A1', 'Model')
  await text(client, model, 'A2', 'Metric')
  await text(client, model, 'B2', 'Value')
  await text(client, model, 'A3', 'Revenue')
  await formula(client, model, 'B3', '=Inputs!B3*Inputs!B4')
  await text(client, model, 'A4', 'Cost')
  await formula(client, model, 'B4', '=B3*Inputs!B5')
  await text(client, model, 'A5', 'Gross Profit')
  await formula(client, model, 'B5', '=B3-B4')
  await text(client, model, 'A6', 'Tax')
  await formula(client, model, 'B6', '=B5*Inputs!B6')
  await text(client, model, 'A7', 'Net Profit')
  await formula(client, model, 'B7', '=B5-B6')

  await text(client, summary, 'A1', 'Summary')
  await text(client, summary, 'A2', 'Metric')
  await text(client, summary, 'B2', 'Value')
  await text(client, summary, 'A3', 'Total Revenue')
  await formula(client, summary, 'B3', '=Model!B3')
  await text(client, summary, 'A4', 'Total Net Profit')
  await formula(client, summary, 'B4', '=Model!B7')
  await text(client, summary, 'A5', 'Profit Margin')
  await formula(client, summary, 'B5', '=B4/B3')
  await text(client, summary, 'A6', 'Units Sold')
  await formula(client, summary, 'B6', '=Inputs!B4')
}
