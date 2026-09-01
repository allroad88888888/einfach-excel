import { createWorkerWorkbookSpreadsheetBackend } from '@einfach/solid-excel/worker-backend'
import RustWorkbookWorker from '@einfach/solid-excel/vnext-worker-runtime?worker'
import {
  RUST_DEMO_CELL_COUNT,
  createRustDemoImportChunks,
  type RustDemoImportCell,
} from './rust-demo-seed'

interface RustDemoImportStats {
  accepted: number
  errors: number
  rejectedFormulas: number
}

interface RustDemoImportClient {
  beginImport(options: { mode: 'direct' }): Promise<number>
  cancelImport(sessionId: number): Promise<boolean>
  commitImport(sessionId: number): Promise<RustDemoImportStats>
  importChunk(sessionId: number, cells: RustDemoImportCell[]): Promise<number>
}

function assertSuccessfulImport(stats: RustDemoImportStats): void {
  if (
    stats.accepted !== RUST_DEMO_CELL_COUNT ||
    stats.errors !== 0 ||
    stats.rejectedFormulas !== 0
  ) {
    throw new Error(
      'Rust workbook import failed: ' +
        `${stats.accepted}/${RUST_DEMO_CELL_COUNT} cells accepted, ` +
        `${stats.errors} errors, ${stats.rejectedFormulas} formulas rejected.`,
    )
  }
}

/** Streams the complete demo seed into an initialized Rust workbook. */
export async function importRustDemoWorkbook(
  client: RustDemoImportClient,
  sheetIndex: number,
): Promise<void> {
  const sessionId = await client.beginImport({ mode: 'direct' })
  let committed = false
  let expectedImported = 0

  try {
    for (const chunk of createRustDemoImportChunks()) {
      expectedImported += chunk.length
      const imported = await client.importChunk(
        sessionId,
        chunk.map((cell) => ({ ...cell, sheet: sheetIndex })),
      )
      if (imported !== expectedImported) {
        throw new Error(
          `Rust workbook normalized ${imported}/${expectedImported} streamed import cells.`,
        )
      }
    }

    const stats = await client.commitImport(sessionId)
    committed = true
    assertSuccessfulImport(stats)
  } catch (error) {
    if (!committed) {
      await client.cancelImport(sessionId).catch(() => false)
    }
    throw error
  }
}

/** Creates the demo's existing neutral backend over the Rust/WASM worker. */
export function createRustDemoBackend(): ReturnType<
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
      await importRustDemoWorkbook(client, sheet.idx)
    },
  })
}
