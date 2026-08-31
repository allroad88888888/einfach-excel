import type {
  WorkerWorkbookBackendSheet,
  WorkerWorkbookSpreadsheetBackendOptions,
} from '../adapter'
type WorkerWorkbookClient = Parameters<
  NonNullable<WorkerWorkbookSpreadsheetBackendOptions['afterInit']>
>[0]
export type WorkerLazyProbe = {
  client: WorkerWorkbookClient
  sheetIdx: number
  beforeState: string
  beforeEvalCount: number
  logged: boolean
}
type WorkerDebugWindow = Window &
  typeof globalThis & { __einfachWorkbookDebugClient?: WorkerWorkbookClient }
let lazyProbe: WorkerLazyProbe | undefined
export async function initializeWorkerLazyProbe(
  client: WorkerWorkbookClient,
  sheets: WorkerWorkbookBackendSheet[],
) {
  if (new URLSearchParams(window.location.search).has('debug'))
    (window as WorkerDebugWindow).__einfachWorkbookDebugClient = client
  const sheetIdx = sheets[1].idx
  lazyProbe = {
    client,
    sheetIdx,
    beforeState: await client.debugFormulaCacheState(sheetIdx, 'C5'),
    beforeEvalCount: await client.debugFormulaEvalCount(sheetIdx),
    logged: false,
  }
}
export function getWorkerLazyProbe() {
  return lazyProbe
}
export function clearWorkerLazyProbe() {
  delete (window as WorkerDebugWindow).__einfachWorkbookDebugClient
  lazyProbe = undefined
}
