/**
 * Seed for the "formulas" demo — a tiny 3-sheet forecast model that proves a
 * real cross-sheet dependency chain recalculates through the worker/WASM
 * engine: Inputs (raw numbers) -> Model (formulas over Inputs!) -> Summary
 * (formulas over Model!, plus one direct Inputs! reference so the chain
 * visibly spans more than one hop). Cells are written one RPC at a time via
 * `WorkerWorkbookClient`, matching how `VNextWorkerDemo.tsx`'s
 * `seedWorkerWorkbook` seeds its own worker-backed demo — there is no bulk
 * "import matrix" entry point on this client, only `setCell` /
 * `setFormulaDetailed` per address.
 */
import type {
  WorkerWorkbookBackendSheet,
  WorkerWorkbookBackendSheetInput,
  WorkerWorkbookClient,
} from '@einfach/solid-excel/vnext'

/** Sheet list passed straight to `makeWasmWorkerBackend({ sheets: ... })`. */
export const formulasSheets: WorkerWorkbookBackendSheetInput[] = [
  { id: 'inputs', name: 'Inputs' },
  { id: 'model', name: 'Model' },
  { id: 'summary', name: 'Summary' },
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

/**
 * `afterInit` seeding callback — same shape as
 * `WorkerWorkbookSpreadsheetBackendOptions['afterInit']`, so it plugs
 * straight into
 * `makeWasmWorkerBackend({ sheets: formulasSheets, afterInit: seedFormulasWorkbook })`.
 * Looks sheet indices up by the `id`s declared in `formulasSheets` above
 * (rather than assuming array order) so it stays correct even if the sheet
 * list is ever reordered.
 */
export async function seedFormulasWorkbook(
  client: WorkerWorkbookClient,
  sheets: WorkerWorkbookBackendSheet[],
): Promise<void> {
  const idxById = new Map(sheets.map((sheet) => [sheet.id, sheet.idx]))
  const inputs = idxById.get('inputs')!
  const model = idxById.get('model')!
  const summary = idxById.get('summary')!

  // Inputs — raw business numbers. Nothing on this sheet is a formula.
  await text(client, inputs, 'A1', 'Inputs')
  await text(client, inputs, 'A2', 'Metric')
  await text(client, inputs, 'B2', 'Value')
  await text(client, inputs, 'A3', 'Unit Price ($)')
  await num(client, inputs, 'B3', 42)
  await text(client, inputs, 'A4', 'Units Sold')
  await num(client, inputs, 'B4', 1200)
  await text(client, inputs, 'A5', 'Cost Rate')
  await num(client, inputs, 'B5', 0.35)
  await text(client, inputs, 'A6', 'Tax Rate')
  await num(client, inputs, 'B6', 0.08)

  // Model — every value derives from Inputs! or another Model! cell.
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
  await text(client, model, 'A8', 'Cost Ratio')
  await formula(client, model, 'B8', '=B4/B3')

  // Summary — aggregates Model!, plus one direct Inputs! reference so the
  // chain visibly spans two hops, not just the immediate one.
  await text(client, summary, 'A1', 'Summary')
  await text(client, summary, 'A2', 'Metric')
  await text(client, summary, 'B2', 'Value')
  await text(client, summary, 'A3', 'Total Revenue')
  await formula(client, summary, 'B3', '=Model!B3')
  await text(client, summary, 'A4', 'Total Net Profit')
  await formula(client, summary, 'B4', '=Model!B7')
  await text(client, summary, 'A5', 'Profit Margin')
  await formula(client, summary, 'B5', '=B4/B3')
  await text(client, summary, 'A6', 'Cost Ratio')
  await formula(client, summary, 'B6', '=Model!B8')
  await text(client, summary, 'A7', 'Units Sold')
  await formula(client, summary, 'B7', '=Inputs!B4')
}
