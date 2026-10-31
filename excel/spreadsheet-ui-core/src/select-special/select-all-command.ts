import { atom } from '@einfach/core'
import { selectAllAtom, selectionAuthorityWitnessAtom, selectionRangesAtom } from '../selection'
import type { CellRange } from '../shared'
import { queryCurrentRegion } from './current-region-command'
import { beginNativeSelection, clearSelectSpecialFeedbackAtom, publishBlocks } from './shared'

const contains = (outer: CellRange, inner: CellRange): boolean =>
  outer.rowStart <= inner.rowStart && outer.rowEnd >= inner.rowEnd &&
  outer.colStart <= inner.colStart && outer.colEnd >= inner.colEnd

const sameRange = (a: CellRange, b: CellRange): boolean => contains(a, b) && contains(b, a)

/**
 * Ctrl+A：选区仍在数据区内时第一次选当前区域，再按（选区已是该区域或更大）选整张表。
 * 孤立的空格或无法向原生查询时直接选整张表。
 */
export const selectAllOrRegionAtom = atom(null, async (get, set): Promise<'region' | 'all' | null> => {
  const ranges = get(selectionRangesAtom)
  const context = beginNativeSelection(get, set)
  if (!context) {
    set(selectAllAtom)
    return 'all'
  }
  try {
    const region = await queryCurrentRegion(get, context)
    if (!region) return null
    const single = ranges.length === 1 ? ranges[0] : null
    const bigger = region.rowEnd > region.rowStart || region.colEnd > region.colStart
    if (bigger && single && contains(region, single) && !sameRange(region, single)) {
      publishBlocks(set, context, [region], 'Selected current region.')
      return 'region'
    }
    set(clearSelectSpecialFeedbackAtom)
    set(selectAllAtom)
    return 'all'
  } catch {
    // 选区在等待期间被用户改动时不抢占；其它原生失败退回整表选择。
    if (get(selectionAuthorityWitnessAtom) !== context.authority) return null
    set(clearSelectSpecialFeedbackAtom)
    set(selectAllAtom)
    return 'all'
  }
})
selectAllOrRegionAtom.debugLabel = 'spreadsheet.selectSpecial.selectAllOrRegion'
