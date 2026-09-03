import { createRustWorkbookConnection } from '@einfach/spreadsheet-ui-core'
import RustWorkbookWorker from '@einfach/spreadsheet-ui-core/rust-runtime?worker'

/** 创建 sales-orders 产品独占的 Rust Worker 连接。 */
export function createSalesOrdersWorkbookConnection(): ReturnType<
  typeof createRustWorkbookConnection
> {
  return createRustWorkbookConnection(() => new RustWorkbookWorker())
}
