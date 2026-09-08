import type { Getter, Setter } from '@einfach/core'
import type { VisibleProjectionResult } from '../backend'
import {
  reconcileRowHeightWindow,
  reconcileColumnWidthWindow,
} from '../viewport/size-projection-validation'
import {
  MAX_VIEWPORT_ROW_HEIGHT,
  MIN_VIEWPORT_ROW_HEIGHT,
  MAX_VIEWPORT_COL_WIDTH,
  MIN_VIEWPORT_COL_WIDTH,
  viewportSizeOverridesAtom,
} from '../viewport/size-overrides'

/** 把 Rust 返回的稀疏行列尺寸合并到坐标缓存；缺省字段不覆盖对应轴。 */
export function applyProjectionSizes(
  get: Getter,
  set: Setter,
  result: VisibleProjectionResult,
): void {
  const current = get(viewportSizeOverridesAtom)
  const currentSheet = current.rowHeightsBySheet[result.sheetId] ?? {}
  const currentColumns = current.colWidthsBySheet[result.sheetId] ?? {}
  let nextSheet = currentSheet
  let nextColumns = currentColumns
  // 所有窗口先合并，最后只发布一次；未返回的窗口尺寸不会被删除。
  for (const region of [result, ...(result.frozen?.regions ?? [])]) {
    const canonical = (region.rowHeights ?? []).filter(
      ({ rowIndex, heightPx }) =>
        Number.isSafeInteger(rowIndex) &&
        rowIndex >= region.window.rowStart &&
        rowIndex <= region.window.rowEnd &&
        Number.isFinite(heightPx) &&
        heightPx >= MIN_VIEWPORT_ROW_HEIGHT &&
        heightPx <= MAX_VIEWPORT_ROW_HEIGHT,
    )
    nextSheet =
      region.rowHeights === undefined
        ? nextSheet
        : reconcileRowHeightWindow(
            nextSheet,
            canonical,
            region.window.rowStart,
            region.window.rowEnd,
          )
    nextColumns =
      region.colWidths === undefined
        ? nextColumns
        : reconcileColumnWidthWindow(
            nextColumns,
            region.colWidths.filter(
              ({ colIndex, widthPx }) =>
                Number.isSafeInteger(colIndex) &&
                colIndex >= region.window.colStart &&
                colIndex <= region.window.colEnd &&
                Number.isFinite(widthPx) &&
                widthPx >= MIN_VIEWPORT_COL_WIDTH &&
                widthPx <= MAX_VIEWPORT_COL_WIDTH,
            ),
            region.window.colStart,
            region.window.colEnd,
          )
  }
  if (sameSparseSizes(currentSheet, nextSheet) && sameSparseSizes(currentColumns, nextColumns))
    return
  set(viewportSizeOverridesAtom, {
    ...current,
    rowHeightsBySheet: {
      ...current.rowHeightsBySheet,
      [result.sheetId]: nextSheet,
    },
    colWidthsBySheet: { ...current.colWidthsBySheet, [result.sheetId]: nextColumns },
  })
}

function sameSparseSizes(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key])
}
