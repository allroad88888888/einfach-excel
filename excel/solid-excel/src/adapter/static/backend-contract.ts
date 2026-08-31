// 一句话：静态后端对外暴露的接口形状。

import type {
  RemoveRowsExactRequest,
  RemoveRowsExactResult,
  SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'

export interface StaticSpreadsheetBackend extends SpreadsheetBackend {
  removeRowsExact(request: RemoveRowsExactRequest): Promise<RemoveRowsExactResult>
}
