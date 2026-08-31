import type {
  WorkerWorkbookBackendSheet,
  WorkerWorkbookSpreadsheetBackendOptions,
} from '../adapter'

type WorkerWorkbookClient = Parameters<
  NonNullable<WorkerWorkbookSpreadsheetBackendOptions['afterInit']>
>[0]

export async function seedWorkerWorkbook(
  client: WorkerWorkbookClient,
  initializedSheets: WorkerWorkbookBackendSheet[],
) {
  const [sheet1, sheet2, sheet3] = initializedSheets.map((sheet) => sheet.idx)
  await client.setCell(sheet1, 'A1', { type: 'text', value: 'Sheet1' })
  await client.setCell(sheet1, 'A2', { type: 'text', value: 'cell1' })
  await client.setCell(sheet1, 'B2', { type: 'text', value: 'result' })
  await client.setCell(sheet1, 'A4', { type: 'text', value: 'cell4' })
  await client.setCell(sheet1, 'B4', { type: 'number', value: 10 })
  await client.setCell(sheet1, 'C4', { type: 'text', value: 'source' })
  await client.setFormulaDetailed(sheet1, 'C2', '=Sheet2!C2+1')
  await client.setCell(sheet2, 'A1', { type: 'text', value: 'Sheet2' })
  await client.setCell(sheet2, 'A2', { type: 'text', value: 'cell2' })
  await client.setCell(sheet2, 'B2', { type: 'text', value: 'depends on Sheet3' })
  await client.setFormulaDetailed(sheet2, 'C2', '=Sheet3!C2+1')
  await client.setCell(sheet2, 'A5', { type: 'text', value: 'lazy demo' })
  await client.setCell(sheet2, 'B5', { type: 'text', value: 'Sheet3!B4+5' })
  await client.setFormulaDetailed(sheet2, 'C5', '=Sheet3!B4+5')
  await client.setCell(sheet3, 'A1', { type: 'text', value: 'Sheet3' })
  await client.setCell(sheet3, 'A2', { type: 'text', value: 'cell3' })
  await client.setCell(sheet3, 'B2', { type: 'text', value: 'depends on Sheet1!B4' })
  await client.setCell(sheet3, 'B4', { type: 'number', value: 100 })
  await client.setFormulaDetailed(sheet3, 'C2', '=Sheet1!B4+1')
}
