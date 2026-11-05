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
export type { XlsxConverter, XlsxConverterLoader } from './workbook/xlsx/xlsx-converter'
export type {
  ContextMenuContribution,
  RibbonContribution,
  SpreadsheetPlugin,
} from './plugin/types'
export type { WorkbookUiOptions } from './page/workbook-ui-options'

export { renderSpreadsheetRangeAsPng } from './workbook/image-export/render-range'
