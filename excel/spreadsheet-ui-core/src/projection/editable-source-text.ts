import type { DisplayCell, VisibleProjectionResult } from '../contracts'
import type { CellCoord } from '../shared'
import { cellAtProjection } from './cell-at'
import { atom } from '@einfach/core'
import { activeCellFactAtom } from './active-cell-fact'

/** undefined 表示目标格尚未读到，不能当作空白允许输入；冻结格复用相同查找规则。 */
export const activeCellInputTextAtom = atom((get) => sourceTextOf(get(activeCellFactAtom)))

/** Resolves the active cell's editable source from the current projection. */
export function getSourceTextFromProjection(
  result: VisibleProjectionResult | undefined,
  cell: CellCoord,
  activeSheetId: string,
): string | undefined {
  if (!result || result.sheetId !== activeSheetId) return undefined
  return sourceTextOf(cellAtProjection(result, cell))
}

function sourceTextOf(cell: DisplayCell | null | undefined): string | undefined {
  if (cell === undefined) return undefined
  return cell ? (cell.inputText ?? cell.formula ?? cell.displayValue ?? '') : ''
}
