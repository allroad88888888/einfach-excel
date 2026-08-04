import type {
  WorkerWorkbookBackendSheet,
  WorkerWorkbookBackendSheetInput,
  WorkerWorkbookClient,
} from '@einfach/solid-excel/vnext'

export const customFormulaSheets: WorkerWorkbookBackendSheetInput[] = [
  { id: 'items', name: 'Items' },
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

/** Seeds formula calls before the host registrations trigger engine re-evaluation. */
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
  await number(client, items, 'B2', 20)
  await text(client, items, 'C2', 'Ava')
  await number(client, items, 'D2', 32)
  await text(client, items, 'A3', 'Notebook')
  await number(client, items, 'B3', 15)
  await text(client, items, 'C3', 'Noah')
  await number(client, items, 'D3', 50)
  await text(client, items, 'A4', 'Headphones')
  await number(client, items, 'B4', 90)
  await text(client, items, 'C4', 'Mia')
  await number(client, items, 'D4', 68)
  await text(client, items, 'A6', 'Custom formulas')
  await formula(client, items, 'B6', '=MYTAX(B2)')
  await formula(client, items, 'C6', '=GREET(C2)')
  await formula(client, items, 'D6', '=CELSIUS(D2)')
  await text(client, items, 'A8', 'Async square')
  await formula(client, items, 'B8', '=SLOWSQR(B2)')
}
