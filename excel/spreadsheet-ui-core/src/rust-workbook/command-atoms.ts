import { atom } from '@einfach/core'
import type { SetCellInputRequest, VisibleProjectionRequest } from '../backend'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'

export interface SetRustCellInputInput {
  readonly request: SetCellInputRequest
  readonly projection: VisibleProjectionRequest
}

/** 将一条单元格输入命令直接发送给当前 store 的 Rust Worker。 */
export const setRustCellInputAtom = atom(null, (get, _set, input: SetRustCellInputInput) => {
  const connection = get(rustWorkbookConnectionAtom)
  if (connection === null) {
    return Promise.reject(new Error('Rust workbook connection is unavailable.'))
  }
  return connection.request('cell.setInput', input)
})
setRustCellInputAtom.debugLabel = 'spreadsheet.rustWorkbook.setCellInput'
