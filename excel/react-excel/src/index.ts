export { Spreadsheet, type SpreadsheetProps } from './Spreadsheet'
export {
  WorkbookRuntimeProvider,
  type WorkbookRuntimeProviderProps,
} from './page/WorkbookRuntimeProvider'
export {
  WorkbookStoreProvider,
  type WorkbookStoreProviderProps,
} from './page/WorkbookStoreProvider'
export { WorkbookView } from './workbook/shell/WorkbookView'

/** 完整视图不接收数据 props；受控消费者通过同一 Store 提供 Core 状态。 */
export type WorkbookViewProps = Record<string, never>
