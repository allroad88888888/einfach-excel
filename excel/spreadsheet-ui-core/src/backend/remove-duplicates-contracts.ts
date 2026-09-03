/** 删除重复行命令的数据契约。 */
export interface RemoveRowsRequest {
  kind: 'remove-rows'
  sheetId: string
  /** 工作表绝对行号；调用方无需排序或去重。 */
  rows: ReadonlyArray<number>
  requestId?: number
  revision?: number | string
}

export interface RemoveRowsResult {
  sheetId: string
  removedRows: number
  affectedRange?: { startRow: number; endRow: number; startCol: number; endCol: number }
  revision: number | string
}
