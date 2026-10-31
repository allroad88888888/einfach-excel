import { atom } from '@einfach/core'
import { selectionRangesAtom } from '../selection'
import { MAX_SELECTION_REGIONS } from '../selection/selection-input-snapshot'
import { assertBlocks, beginNativeSelection, fail, isCurrent, publishBlocks } from './shared'

/** Alt+; / 定位条件“仅可见单元格”：选区变为未隐藏块的多区域选区。 */
export const selectVisibleCellsAtom = atom(null, async (get, set): Promise<boolean> => {
  const context = beginNativeSelection(get, set)
  if (!context) return false
  const ranges = get(selectionRangesAtom)
  try {
    const result = await context.connection.request('selection.visibleBlocks', {
      sheetId: context.sheet.id,
      ranges,
      limit: MAX_SELECTION_REGIONS,
    })
    if (!isCurrent(get, context, result.revision)) return false
    assertBlocks(result.blocks, context, result.cellCount)
    if (!result.blocks.length) return fail(set, 'No visible cells in the selection.')
    publishBlocks(
      set,
      context,
      result.blocks,
      `Selected ${result.cellCount} visible cells in ${result.blocks.length} areas.`,
    )
    return true
  } catch (cause) {
    return fail(set, cause instanceof Error ? cause.message : String(cause))
  }
})
selectVisibleCellsAtom.debugLabel = 'spreadsheet.selectSpecial.visibleCells'
