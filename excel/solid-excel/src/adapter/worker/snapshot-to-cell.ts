// 一句话：把一条单元格线格式快照读成 DisplayCell。

import type { DisplayCell } from '@einfach/spreadsheet-ui-core'
import { numericValue } from '@einfach/spreadsheet-ui-core'
import type { CellSnapshotWire } from '../worker-protocol'
import { parseA1 } from './wire-range'

export function snapshotToDisplayCell(snapshot: CellSnapshotWire): DisplayCell | null {
  const coord = parseA1(snapshot.addr)
  if (!coord) {
    return null
  }

  if (snapshot.type === 'null' && snapshot.formula === '' && snapshot.display === '') {
    return null
  }

  const valueKind = snapshot.isError
    ? 'error'
    : snapshot.type === 'text'
      ? 'string'
      : snapshot.type === 'null'
        ? 'blank'
        : snapshot.type

  const cell: DisplayCell = {
    row: coord.row,
    col: coord.col,
    displayValue: snapshot.display,
    valueKind,
  }

  if (snapshot.type === 'number' && valueKind === 'number') {
    const value = numericValue(snapshot.display)
    if (value !== null) cell.numericValue = value
  }

  if (snapshot.formula !== '') {
    cell.formula = snapshot.formula
  }
  if (snapshot.isError) {
    cell.error = {
      code: 'BACKEND_ERROR',
      message: snapshot.display,
    }
  }

  return cell
}
