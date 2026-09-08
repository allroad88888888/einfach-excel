import type { ProjectionResult } from '../projection/types'
import { mergeRangeAt } from '../shared/merge'
import type { CellRange } from '../shared'
import type { ActiveSelectionCell, MultiRangeSelectionState, SelectionState } from './types'

/** 只扩展与合并矩形相交的单元格选区；整行/整列选择仍保留其语义。 */
function expand(selection: SelectionState, ranges: readonly CellRange[]): SelectionState {
  if (selection.kind !== 'cell' && selection.kind !== 'range') return selection
  const { anchor, focus } = selection
  let range = {
    rowStart: Math.min(anchor.row, focus.row),
    rowEnd: Math.max(anchor.row, focus.row),
    colStart: Math.min(anchor.col, focus.col),
    colEnd: Math.max(anchor.col, focus.col),
  }
  const original = range
  // 一次扩展可能碰到另一个合并框，直到边界不再变化；不遍历单元格。
  let changed = true
  while (changed) {
    changed = false
    for (const merge of ranges) {
      if (
        merge.rowStart > range.rowEnd ||
        merge.rowEnd < range.rowStart ||
        merge.colStart > range.colEnd ||
        merge.colEnd < range.colStart
      )
        continue
      const next = {
        rowStart: Math.min(range.rowStart, merge.rowStart),
        rowEnd: Math.max(range.rowEnd, merge.rowEnd),
        colStart: Math.min(range.colStart, merge.colStart),
        colEnd: Math.max(range.colEnd, merge.colEnd),
      }
      if (
        next.rowStart !== range.rowStart ||
        next.rowEnd !== range.rowEnd ||
        next.colStart !== range.colStart ||
        next.colEnd !== range.colEnd
      ) {
        range = next
        changed = true
      }
    }
  }
  if (range === original) return selection
  return {
    kind: 'range',
    sheetId: selection.sheetId,
    anchor: {
      row: anchor.row <= focus.row ? range.rowStart : range.rowEnd,
      col: anchor.col <= focus.col ? range.colStart : range.colEnd,
    },
    focus: {
      row: anchor.row <= focus.row ? range.rowEnd : range.rowStart,
      col: anchor.col <= focus.col ? range.colEnd : range.colStart,
    },
  }
}

export function projectMergedSelection(
  multi: MultiRangeSelectionState,
  result: ProjectionResult | undefined,
): MultiRangeSelectionState {
  if (result?.kind !== 'visible-window' || !result.mergedRanges?.length) return multi
  return {
    ...multi,
    regions: multi.regions.map((region) =>
      region.sheetId === result.sheetId ? expand(region, result.mergedRanges!) : region,
    ),
  }
}

/** 输入、格式栏和名称框使用合并锚点，不把右下角覆盖格当成当前数据格。 */
export function mergedActiveCell(
  cell: ActiveSelectionCell,
  result: ProjectionResult | undefined,
): ActiveSelectionCell {
  if (result?.kind !== 'visible-window' || result.sheetId !== cell.sheetId) return cell
  const range = mergeRangeAt(result.mergedRanges ?? [], cell)
  return range ? { ...cell, row: range.rowStart, col: range.colStart } : cell
}
