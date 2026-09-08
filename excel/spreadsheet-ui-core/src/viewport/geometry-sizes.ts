import { atom } from '@einfach/core'
import { viewportSizeOverridesAtom } from './size-overrides'
import {
  sheetHiddenRowsBackingAtom,
  viewportHiddenColsBackingAtom,
  viewportFilterHiddenBackingAtom,
} from './hidden-state'

/** 可见几何是派生值：隐藏索引占 0px，原生行高/列宽缓存始终保留原值。 */
export const viewportGeometrySizesAtom = atom((get) => {
  const sizes = get(viewportSizeOverridesAtom)
  const rows = get(sheetHiddenRowsBackingAtom)
  const cols = get(viewportHiddenColsBackingAtom)
  const filter = get(viewportFilterHiddenBackingAtom).rowsBySheet
  const zeroHidden = (
    source: Record<string, Record<string, number>>,
    ...maps: Record<string, number[]>[]
  ) => {
    const result = { ...source }
    for (const map of maps)
      for (const [sheet, indices] of Object.entries(map)) {
        if (!indices.length) continue
        result[sheet] = { ...result[sheet] }
        for (const index of indices) result[sheet]![index] = 0
      }
    return result
  }
  return {
    rowHeightsBySheet: zeroHidden(sizes.rowHeightsBySheet, rows, filter),
    colWidthsBySheet: zeroHidden(sizes.colWidthsBySheet, cols),
  }
})
viewportGeometrySizesAtom.debugLabel = 'spreadsheet.viewport.geometrySizes'
