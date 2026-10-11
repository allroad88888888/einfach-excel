import type { WorkerCommand } from '../rust-worker'
import type { RustWorkbookSheet } from './commands'

/** 文件只额外记录标题与有限画布；单元格及格式事实仍是 Rust 的原生快照。 */
export interface WorkbookFileMetadata {
  readonly title: string
  readonly sheets: readonly (RustWorkbookSheet & {
    readonly rowCount: number
    readonly colCount: number
  })[]
}

export const WORKBOOK_FILE_MAX_BYTES = 64 * 1024 * 1024

export interface RustWorkbookFileCommands {
  readonly 'workbook.exportFile': WorkerCommand<
    { readonly title: string },
    { readonly text: string; readonly filename: string }
  >
  readonly 'workbook.openFile': WorkerCommand<
    { readonly text: string; readonly idPrefix: string },
    WorkbookFileMetadata
  >
}
