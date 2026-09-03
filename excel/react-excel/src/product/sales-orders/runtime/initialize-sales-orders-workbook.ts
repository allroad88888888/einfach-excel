import type {
  RustImportStats,
  RustWorkbookConnection,
} from '@einfach/spreadsheet-ui-core'
import {
  SALES_ORDER_CELL_COUNT,
  createSalesOrderImportChunks,
} from '../data/import-seed'

function addStats(total: RustImportStats, chunk: RustImportStats): RustImportStats {
  return {
    accepted: total.accepted + chunk.accepted,
    formulas: total.formulas + chunk.formulas,
    rejectedFormulas: total.rejectedFormulas + chunk.rejectedFormulas,
    cleared: total.cleared + chunk.cleared,
    errors: total.errors + chunk.errors,
    issues: [...(total.issues ?? []), ...(chunk.issues ?? [])],
  }
}

/** 初始化产品工作簿，并把 1,000 行演示数据分块送入 Rust。 */
export async function initializeSalesOrdersWorkbook(
  connection: RustWorkbookConnection,
): Promise<void> {
  await connection.request('workbook.initialize', {
    sheets: [{ id: 'orders', name: 'Orders' }],
  })
  let stats: RustImportStats = {
    accepted: 0,
    formulas: 0,
    rejectedFormulas: 0,
    cleared: 0,
    errors: 0,
  }
  for (const cells of createSalesOrderImportChunks()) {
    stats = addStats(
      stats,
      await connection.request('workbook.importCells', { cells }),
    )
  }
  if (
    stats.accepted !== SALES_ORDER_CELL_COUNT ||
    stats.errors > 0 ||
    stats.rejectedFormulas > 0
  ) {
    throw new Error(`Rust import accepted ${stats.accepted}/${SALES_ORDER_CELL_COUNT} cells`)
  }
}
