import { clearCell, setCell, setFormulaDetailed, setFormulaInstalled, snapshotCell } from './worker-cell-ops'
import type { WorkerCommandHandler } from './worker-command'
import { postResponse } from './worker-post'
import { dispatchAutoFill, dispatchCellWrite } from './worker-rejections'
import {
  assertMethod,
  assertSheet,
  normalizeAddr,
  normalizeRefWire,
  normalizeSparseRange,
} from './worker-wire-guards'
import type { AutoFillReportWire, AutoFillRequestWire, CellRefWire, CellWire } from './worker-protocol'

/** 单元格内容的读写命令：单格写、公式写、清空、区间清空、自动填充与读取。 */

export const handleCellCommand: WorkerCommandHandler = (id, msg, wb) => {
  switch (msg.cmd) {
    // Every single-cell write goes through `dispatchCellWrite`: an
    // engine refusal becomes a CELL_WRITE_REJECTED error instead of a
    // success-shaped ACK that silently discards the host's value.
    case 'setCell':
      dispatchCellWrite(id, () =>
        setCell(wb, Number(msg.sheet), normalizeAddr(msg.addr), msg.value as CellWire),
      )
      return true
    case 'setFormula':
      dispatchCellWrite(id, () =>
        setFormulaInstalled(wb, Number(msg.sheet), normalizeAddr(msg.addr), msg.formula),
      )
      return true
    case 'setFormulaDetailed':
      dispatchCellWrite(id, () =>
        setFormulaDetailed(wb, Number(msg.sheet), normalizeAddr(msg.addr), msg.formula),
      )
      return true
    case 'clearCell':
      dispatchCellWrite(id, () => clearCell(wb, Number(msg.sheet), normalizeAddr(msg.addr)))
      return true
    case 'clearRange': {
      const range = normalizeSparseRange(msg.range)
      assertSheet(wb, range.sheet)
      const clearRange = assertMethod(wb, 'clear_range')
      postResponse(
        id,
        clearRange.call(
          wb,
          range.sheet,
          range.startRow,
          range.startCol,
          range.endRow,
          range.endCol,
        ),
      )
      return true
    }
    case 'applyAutoFill': {
      const applyAutoFill = assertMethod(wb, 'apply_auto_fill')
      dispatchAutoFill(
        id,
        () => applyAutoFill.call(wb, msg.request as AutoFillRequestWire) as AutoFillReportWire,
      )
      return true
    }
    case 'readCells':
      postResponse(
        id,
        Array.isArray(msg.cells)
          ? msg.cells.map((cell) => snapshotCell(wb, cell as CellRefWire))
          : [],
      )
      return true
    case 'listNonEmpty': {
      const listNonEmpty = assertMethod(wb, 'list_non_empty_cells')
      postResponse(id, listNonEmpty.call(wb).map(normalizeRefWire))
      return true
    }
    default:
      return false
  }
}
