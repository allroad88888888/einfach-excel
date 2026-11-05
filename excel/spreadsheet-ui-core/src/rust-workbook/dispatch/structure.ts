import { applyRustHistory } from '../history-apply'
import { changeFreeze } from '../freeze-io'
import { changeMerge } from '../merge-io'
import { shiftCells } from '../shift-cells-io'
import { changeStructure } from '../structure-io'
import { changeSize } from '../resize-io'
import { readSizes } from '../size-io'
import { changeVisibility } from '../visibility-io'
import { transferDraggedRange } from '../drag-move/command'
import { readVisibleProjection } from '../visible-projection'
import type { WorkbookHandlers } from './context'

/** 表内结构与布局：冻结、合并、平移、插删行列、尺寸、隐藏、拖动移动与撤销重做。 */
export const structureHandlers: WorkbookHandlers = {
  'sheet.freeze': (context, current, input) => {
    context.sheetIndex(input.sheetId)
    const result = changeFreeze(
      current, context.sheetsById.get(input.sheetId)!, input, context.revision)
    if (result.changed) context.revision += 1
    return result
  },
  'range.merge': (context, current, input) => {
    const result = changeMerge(
      current, context.sheetIndex(input.sheetId), input, context.revision)
    if (result.changed) context.revision += 1
    return result
  },
  'range.shiftCells': (context, current, input) => {
    const result = shiftCells(current, context.sheetIndex(input.sheetId), input, context.revision)
    if (result.changed) {
      context.revision += 1
      if (context.clipboard?.cut) context.clipboard.invalidated = true
    }
    return result
  },
  'sheet.editStructure': (context, current, input) => {
    const result = changeStructure(current, context.sheetsById, input, context.revision + 1)
    context.revision += 1
    if (context.clipboard) context.clipboard.invalidated = true
    context.painterToken = undefined
    return result
  },
  'history.apply': (context, current, input) => {
    const result = applyRustHistory(current, context.sheetsById, input, context.revision + 1)
    context.revision += 1
    if (result.sheets && context.clipboard) context.clipboard.invalidated = true
    if (result.sheets) context.painterToken = undefined
    return result
  },
  'range.resize': (context, current, input) => {
    const index = context.sheetIndex(input.sheetId)
    changeSize(current, index, input)
    context.revision += 1
    return {
      projection: readVisibleProjection(current, index, input.projection, context.revision),
      sizes: readSizes(current, index, input.range),
    }
  },
  'range.visibility': (context, current, input) => {
    if (input.sheetId !== input.projection.sheetId) throw new Error('PROJECTION_SHEET_MISMATCH')
    const index = context.sheetIndex(input.sheetId)
    const changed = changeVisibility(current, index, input, context.sheetsById.get(input.sheetId)!)
    return context.projectChange(changed, input)
  },
  'range.dragTransfer': (context, current, input) => {
    const result = transferDraggedRange(
      current, context.sheetsById, input, context.revision + 1)
    context.revision += 1
    return result
  },
}
