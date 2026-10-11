import { atom } from '@einfach/core'
import { viewportSizeOverridesAtom } from './size-overrides'
import { nativeOutlineProjectionBackingAtom } from '../outline/native-state'
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
  const outline = get(nativeOutlineProjectionBackingAtom)
  const outlineRows = Object.fromEntries(
    Object.entries(outline).map(([id, state]) => [id, state.outlineRows ?? []]))
  const outlineCols = Object.fromEntries(
    Object.entries(outline).map(([id, state]) => [id, state.outlineColumns ?? []]))
  const zeroHidden = (
    source: Record<string, Record<string, number>>,
    ...maps: Record<string, readonly number[]>[]
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
    rowHeightsBySheet: zeroHidden(sizes.rowHeightsBySheet, rows, filter, outlineRows),
    colWidthsBySheet: zeroHidden(sizes.colWidthsBySheet, cols, outlineCols),
  }
})
viewportGeometrySizesAtom.debugLabel = 'spreadsheet.viewport.geometrySizes'
