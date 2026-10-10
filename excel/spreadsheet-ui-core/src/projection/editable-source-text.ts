import type { VisibleProjectionResult } from '../backend'
import type { CellCoord } from '../shared'
import { cellAtProjection } from './cell-at'
import { atom } from '@einfach/core'
import { projectionSnapshotAtom } from './state'
import { selectionSnapshotAtom } from '../selection'

/** undefined 表示目标格尚未读到，不能当作空白允许输入；冻结格复用相同查找规则。 */
export const activeCellInputTextAtom = atom((get) => {
  const selection = get(selectionSnapshotAtom)
  const result = get(projectionSnapshotAtom).result
  return getSourceTextFromProjection(
    result?.kind === 'visible-window' ? result : undefined,
    selection.activeCell,
    selection.selection.sheetId,
  )
})

/** Resolves the active cell's editable source from the current projection. */
export function getSourceTextFromProjection(
  result: VisibleProjectionResult | undefined,
  cell: CellCoord,
  activeSheetId: string,
): string | undefined {
  if (!result || result.sheetId !== activeSheetId) return undefined
  const projectionCell = cellAtProjection(result, cell)
  if (projectionCell === undefined) return undefined
  return projectionCell
    ? (projectionCell.inputText ?? projectionCell.formula ?? projectionCell.displayValue ?? '')
    : ''
}
