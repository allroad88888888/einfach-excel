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
  if (result.rowHeights === undefined && result.colWidths === undefined) return
  const current = get(viewportSizeOverridesAtom)
  const canonical = (result.rowHeights ?? []).filter(
    ({ rowIndex, heightPx }) =>
      Number.isSafeInteger(rowIndex) &&
      rowIndex >= result.window.rowStart &&
      rowIndex <= result.window.rowEnd &&
      Number.isFinite(heightPx) &&
      heightPx >= MIN_VIEWPORT_ROW_HEIGHT &&
      heightPx <= MAX_VIEWPORT_ROW_HEIGHT,
  )
  const currentSheet = current.rowHeightsBySheet[result.sheetId] ?? {}
  const nextSheet =
    result.rowHeights === undefined
      ? currentSheet
      : reconcileRowHeightWindow(
          currentSheet,
          canonical,
          result.window.rowStart,
          result.window.rowEnd,
        )
  const currentColumns = current.colWidthsBySheet[result.sheetId] ?? {}
  const nextColumns =
    result.colWidths === undefined
      ? currentColumns
      : reconcileColumnWidthWindow(
          currentColumns,
          result.colWidths.filter(
            ({ colIndex, widthPx }) =>
              Number.isSafeInteger(colIndex) &&
              colIndex >= result.window.colStart &&
              colIndex <= result.window.colEnd &&
              Number.isFinite(widthPx) &&
              widthPx >= MIN_VIEWPORT_COL_WIDTH &&
              widthPx <= MAX_VIEWPORT_COL_WIDTH,
          ),
          result.window.colStart,
          result.window.colEnd,
        )
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
