import type { Getter, Setter } from '@einfach/core'
import type { VisibleProjectionResult } from '../backend'
import {
  reconcileRowHeightWindow,
} from '../viewport/size-projection-validation'
import {
  MAX_VIEWPORT_ROW_HEIGHT,
  MIN_VIEWPORT_ROW_HEIGHT,
  viewportSizeOverridesAtom,
} from '../viewport/size-overrides'

/** 把 Rust 可见投影携带的 rowStyle.height 合并到 UI Core 的坐标缓存。 */
export function applyProjectionRowHeights(
  get: Getter,
  set: Setter,
  result: VisibleProjectionResult,
): void {
  if (result.rowHeights === undefined) return
  const current = get(viewportSizeOverridesAtom)
  const canonical = result.rowHeights.filter(
    ({ rowIndex, heightPx }) =>
      Number.isSafeInteger(rowIndex) &&
      rowIndex >= result.window.rowStart &&
      rowIndex <= result.window.rowEnd &&
      Number.isFinite(heightPx) &&
      heightPx >= MIN_VIEWPORT_ROW_HEIGHT &&
      heightPx <= MAX_VIEWPORT_ROW_HEIGHT,
  )
  const currentSheet = current.rowHeightsBySheet[result.sheetId] ?? {}
  const nextSheet = reconcileRowHeightWindow(
    currentSheet,
    canonical,
    result.window.rowStart,
    result.window.rowEnd,
  )
  if (sameSparseSizes(currentSheet, nextSheet)) return
  set(viewportSizeOverridesAtom, {
    ...current,
    rowHeightsBySheet: {
      ...current.rowHeightsBySheet,
      [result.sheetId]: nextSheet,
    },
  })
}

function sameSparseSizes(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key])
}
