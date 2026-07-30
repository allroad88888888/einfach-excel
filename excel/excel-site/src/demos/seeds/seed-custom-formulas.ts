/**
 * Seed for the "custom formulas" demo (worker-wasm, per `registry.ts`). A
 * small prices/names/temperatures table, seeded one RPC at a time via
 * `WorkerWorkbookClient` — same shape as `seed-formulas.ts`'s
 * `seedFormulasWorkbook`: there is no bulk "import matrix" entry point on
 * this client, only `setCell` / `setFormulaDetailed` per address.
 *
 * Row 8 calls the three sync custom formulas (`=MYTAX(B2)` etc.); row 10
 * calls the async one (`=SLOWSQR(B2)`). Both rows reference cells this
 * seed writes BEFORE `CustomFormulasDemo.tsx` registers any custom
 * formula — see that file's header for why that race is safe (the engine
 * re-evaluates every formula that consulted the custom registry once a
 * name lands).
 */
import type {
  WorkerWorkbookBackendSheet,
  WorkerWorkbookBackendSheetInput,
  WorkerWorkbookClient,
} from '@einfach/solid-excel/vnext'

/** Sheet list passed straight to `makeWasmWorkerBackend({ sheets: ... })`. */
export const customFormulasSheets: WorkerWorkbookBackendSheetInput[] = [
  { id: 'items', name: 'Items' },
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
 * `makeWasmWorkerBackend({ sheets: customFormulasSheets, afterInit: seedCustomFormulasWorkbook })`.
 */
export async function seedCustomFormulasWorkbook(
  client: WorkerWorkbookClient,
  sheets: WorkerWorkbookBackendSheet[],
): Promise<void> {
  const items = sheets.find((sheet) => sheet.id === 'items')!.idx

  await text(client, items, 'A1', 'Item')
  await text(client, items, 'B1', 'Price')
  await text(client, items, 'C1', 'Name')
  await text(client, items, 'D1', 'Fahrenheit')

  await text(client, items, 'A2', 'Coffee')
  await num(client, items, 'B2', 20)
  await text(client, items, 'C2', 'Ava')
  await num(client, items, 'D2', 32)

  await text(client, items, 'A3', 'Notebook')
  await num(client, items, 'B3', 15)
  await text(client, items, 'C3', 'Noah')
  await num(client, items, 'D3', 50)

  await text(client, items, 'A4', 'Headphones')
  await num(client, items, 'B4', 90)
  await text(client, items, 'C4', 'Mia')
  await num(client, items, 'D4', 68)

  await text(client, items, 'A5', 'Desk Lamp')
  await num(client, items, 'B5', 25)
  await text(client, items, 'C5', 'Liam')
  await num(client, items, 'D5', 86)

  await text(client, items, 'A6', 'Backpack')
  await num(client, items, 'B6', 40)
  await text(client, items, 'C6', 'Zoe')
  await num(client, items, 'D6', 104)

  // Row 7 is a blank spacer. Row 8 calls the three sync custom formulas
  // against row 2's data (20 -> 4 tax, 'Ava' -> greeting, 32F -> 0C).
  await text(client, items, 'A8', 'Custom formulas:')
  await formula(client, items, 'B8', '=MYTAX(B2)')
  await formula(client, items, 'C8', '=GREET(C2)')
  await formula(client, items, 'D8', '=CELSIUS(D2)')

  // Row 9 is a blank spacer. Row 10 calls the async one — the cell shows
  // #BUSY! until the worker's pump settles it (~800ms artificial delay
  // inside SLOWSQR's own source; see `CustomFormulasDemo.tsx`), then
  // resolves to 20*20 = 400 with no further action from the visitor.
  await text(client, items, 'A10', 'Async (SLOWSQR, ~800ms):')
  await formula(client, items, 'B10', '=SLOWSQR(B2)')
}
