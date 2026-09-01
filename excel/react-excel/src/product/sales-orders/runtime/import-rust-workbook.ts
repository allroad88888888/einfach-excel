import {
  SALES_ORDER_CELL_COUNT,
  createSalesOrderImportChunks,
  type SalesOrderImportCell,
} from '../data/import-seed'

interface RustImportStats {
  accepted: number
  errors: number
  rejectedFormulas: number
}

interface RustImportClient {
  beginImport(options: { mode: 'direct' }): Promise<number>
  cancelImport(sessionId: number): Promise<boolean>
  commitImport(sessionId: number): Promise<RustImportStats>
  importChunk(sessionId: number, cells: SalesOrderImportCell[]): Promise<number>
}

function assertSuccessfulImport(stats: RustImportStats): void {
  if (
    stats.accepted !== SALES_ORDER_CELL_COUNT ||
    stats.errors !== 0 ||
    stats.rejectedFormulas !== 0
  ) {
    throw new Error(
      'Rust workbook import failed: ' +
        `${stats.accepted}/${SALES_ORDER_CELL_COUNT} cells accepted, ` +
        `${stats.errors} errors, ${stats.rejectedFormulas} formulas rejected.`,
    )
  }
}

/** Streams the complete sales-order seed into an initialized Rust workbook. */
export async function importRustWorkbook(
  client: RustImportClient,
  sheetIndex: number,
): Promise<void> {
  const sessionId = await client.beginImport({ mode: 'direct' })
  let committed = false
  let expectedImported = 0

  try {
    for (const chunk of createSalesOrderImportChunks()) {
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
