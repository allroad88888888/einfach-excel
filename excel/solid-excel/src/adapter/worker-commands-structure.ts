import type { WorkerCommandHandler } from './worker-command'
import { postResponse } from './worker-post'
import {
  assertMethod,
  assertSheet,
  normalizeDimensionPx,
  normalizeStructuralIndex,
  normalizeStructuralCount,
} from './worker-wire-guards'

/** 行列的结构编辑与尺寸：增删行列、设行高列宽。 */

export const handleStructureCommand: WorkerCommandHandler = (id, msg, wb) => {
  switch (msg.cmd) {
    case 'insertRows': {
      const sheet = normalizeStructuralIndex(msg.sheet, 'sheet index')
      const rowIndex = normalizeStructuralIndex(msg.rowIndex, 'row index')
      const count = normalizeStructuralCount(msg.count)
      assertSheet(wb, sheet)
      assertMethod(wb, 'insert_row').call(wb, sheet, rowIndex, count)
      postResponse(id, true)
      return true
    }
    case 'deleteRows': {
      const sheet = normalizeStructuralIndex(msg.sheet, 'sheet index')
      const rowIndex = normalizeStructuralIndex(msg.rowIndex, 'row index')
      const count = normalizeStructuralCount(msg.count)
      assertSheet(wb, sheet)
      assertMethod(wb, 'delete_row').call(wb, sheet, rowIndex, count)
      postResponse(id, true)
      return true
    }
    case 'insertColumns': {
      const sheet = normalizeStructuralIndex(msg.sheet, 'sheet index')
      const colIndex = normalizeStructuralIndex(msg.colIndex, 'column index')
      const count = normalizeStructuralCount(msg.count)
      assertSheet(wb, sheet)
      assertMethod(wb, 'insert_col').call(wb, sheet, colIndex, count)
      postResponse(id, true)
      return true
    }
    case 'deleteColumns': {
      const sheet = normalizeStructuralIndex(msg.sheet, 'sheet index')
      const colIndex = normalizeStructuralIndex(msg.colIndex, 'column index')
      const count = normalizeStructuralCount(msg.count)
      assertSheet(wb, sheet)
      assertMethod(wb, 'delete_col').call(wb, sheet, colIndex, count)
      postResponse(id, true)
      return true
    }
    case 'setRowHeight': {
      const sheet = normalizeStructuralIndex(msg.sheet, 'sheet index')
      const rowIndex = normalizeStructuralIndex(msg.rowIndex, 'row index')
      const heightPx = normalizeDimensionPx(msg.heightPx, 'row height')
      assertSheet(wb, sheet)
      postResponse(id, assertMethod(wb, 'set_row_height').call(wb, sheet, rowIndex, heightPx))
      return true
    }
    case 'setColumnWidth': {
      const sheet = normalizeStructuralIndex(msg.sheet, 'sheet index')
      const colIndex = normalizeStructuralIndex(msg.colIndex, 'column index')
      const widthPx = normalizeDimensionPx(msg.widthPx, 'column width')
      assertSheet(wb, sheet)
      postResponse(id, assertMethod(wb, 'set_col_width').call(wb, sheet, colIndex, widthPx))
      return true
    }
    default:
      return false
  }
}
