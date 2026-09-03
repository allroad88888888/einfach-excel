import { atom } from '@einfach/core'
import type { SetCellInputRequest } from '../backend'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'

/** 将一条单元格输入命令直接发送给当前 store 的 Rust Worker。 */
export const setRustCellInputAtom = atom(
  null,
  (get, _set, request: SetCellInputRequest) => {
    const connection = get(rustWorkbookConnectionAtom)
    if (connection === null) {
      return Promise.reject(new Error('Rust workbook connection is unavailable.'))
    }
    return connection.request('cell.setInput', { request })
  },
)
setRustCellInputAtom.debugLabel = 'spreadsheet.rustWorkbook.setCellInput'
