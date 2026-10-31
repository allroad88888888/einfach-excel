import { atom } from '@einfach/core'
import type { Getter } from '@einfach/core'
import type { CellRange } from '../shared'
import { rangeToA1 } from '../name-box/address'
import { assertBlocks, beginNativeSelection, fail, isCurrent, publishBlocks } from './shared'
import type { NativeSelectionContext } from './shared'

/** 只读查询活动格的当前区域；过期、失败或越界时不触碰选区。 */
export async function queryCurrentRegion(
  get: Getter,
  context: NativeSelectionContext,
): Promise<CellRange | null> {
  const { active } = context
  const result = await context.connection.request('selection.currentRegion', {
    sheetId: context.sheet.id,
    row: active.row,
    col: active.col,
  })
  if (!isCurrent(get, context, result.revision)) return null
  const { rowStart, rowEnd, colStart, colEnd } = result.range
  assertBlocks([result.range], context, (rowEnd - rowStart + 1) * (colEnd - colStart + 1))
  return result.range
}

/** Ctrl+Shift+* / 定位条件“当前区域”：选中活动格所在的连续数据块。 */
export const selectCurrentRegionAtom = atom(null, async (get, set): Promise<boolean> => {
  const context = beginNativeSelection(get, set)
  if (!context) return false
  try {
    const range = await queryCurrentRegion(get, context)
    if (!range) return false
    publishBlocks(set, context, [range], `Selected current region ${rangeToA1(range)}.`)
    return true
  } catch (cause) {
    return fail(set, cause instanceof Error ? cause.message : String(cause))
  }
})
selectCurrentRegionAtom.debugLabel = 'spreadsheet.selectSpecial.currentRegion'
