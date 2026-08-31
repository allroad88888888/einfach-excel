import { formatA1, parseA1, type CellCoord } from '@einfach/excel-core-ts'
import type { CellRefWire, CellWire } from '../worker-protocol'
import { normalizeAddr, normalizeSparseRange } from '../worker-wire-guards'
import {
  clearCell,
  readCellSnapshot,
  setCellFromWire,
  setFormulaDetailed,
  spillRegionAt,
} from './cell-values'
import {
  clearRange,
  readSparseRange,
  snapshotRangeSparse,
  snapshotSparse,
} from './range-projection'
import { rpcError } from './runtime-errors'
import { handled, unhandled, type RuntimeCommandHandler } from './runtime-dispatch'
import { assertSheetIdx } from './runtime-state'

function coordFor(value: unknown): CellCoord {
  const addr = normalizeAddr(value)
  const coord = parseA1(addr)
  if (!coord) throw rpcError('INVALID_ADDR', `invalid cell address: ${String(value)}`)
  return coord
}

export const handleCellCommands: RuntimeCommandHandler = (msg, { state }) => {
  switch (msg.cmd) {
    case 'setCell': {
      const sheet = assertSheetIdx(state, Number(msg.sheet))
      const coord = coordFor(msg.addr)
      return handled(setCellFromWire(state, sheet, coord.row, coord.col, msg.value as CellWire))
    }
    case 'setFormula':
    case 'setFormulaDetailed': {
      const sheet = assertSheetIdx(state, Number(msg.sheet))
      const coord = coordFor(msg.addr)
      const result = setFormulaDetailed(state, sheet, coord.row, coord.col, msg.formula)
      return handled(msg.cmd === 'setFormula' ? result.ok : result)
    }
    case 'clearCell': {
      const sheet = assertSheetIdx(state, Number(msg.sheet))
      const coord = coordFor(msg.addr)
      clearCell(state, sheet, coord.row, coord.col)
      return handled(true)
    }
    case 'clearRange':
      return handled(clearRange(state, normalizeSparseRange(msg.range)))
    case 'snapshotSparse':
      return handled(snapshotSparse(state))
    case 'snapshotRangeSparse':
      return handled(snapshotRangeSparse(state, normalizeSparseRange(msg.range)))
    case 'readSparseRange':
      return handled(readSparseRange(state, normalizeSparseRange(msg.range)))
    case 'spillRegion': {
      const sheet = assertSheetIdx(state, Number(msg.sheet))
      const coord = coordFor(msg.addr)
      return handled(spillRegionAt(state, sheet, coord.row, coord.col))
    }
    case 'readCells': {
      const cells = Array.isArray(msg.cells) ? (msg.cells as CellRefWire[]) : []
      return handled(
        cells.map((ref) => {
          const sheet = assertSheetIdx(state, Number(ref.sheet))
          const coord = parseA1(normalizeAddr(ref.addr))
          return coord
            ? readCellSnapshot(state, sheet, coord.row, coord.col)
            : {
                sheet: sheet.idx,
                addr: normalizeAddr(ref.addr),
                display: '',
                type: 'null' as const,
                isError: false,
                formula: '',
              }
        }),
      )
    }
    case 'listNonEmpty': {
      const out: CellRefWire[] = []
      for (const sheet of state.sheets) {
        const target = state.workbook.sheet(sheet.id)
        if (!target) continue
        for (const [key] of state.workbook.store.getter(target.sheetAtom)) {
          const [row, col] = key.split(':').map(Number)
          out.push({ sheet: sheet.idx, addr: formatA1({ row, col }) })
        }
      }
      return handled(out)
    }
    default:
      return unhandled()
  }
}
