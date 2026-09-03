import { createWorkerWorkbookSpreadsheetBackend } from '@einfach/spreadsheet-ui-core/rust-worker'
import RustWorkbookWorker from '@einfach/spreadsheet-ui-core/rust-worker/runtime?worker'
import { importRustWorkbook } from './import-rust-workbook'

/** Creates the sales-order workbook over the Rust/WASM worker. */
export function createRustWorkbookBackend(): ReturnType<
  typeof createWorkerWorkbookSpreadsheetBackend
> {
  return createWorkerWorkbookSpreadsheetBackend({
    workerFactory: () => new RustWorkbookWorker(),
    sheets: [{ id: 'orders', name: 'Orders' }],
    afterInit: async (client, sheets) => {
      const sheet = sheets[0]
      if (sheet === undefined) {
        throw new Error('Rust workbook did not initialize the Orders sheet.')
      }
      await importRustWorkbook(client, sheet.idx)
    },
  })
}
