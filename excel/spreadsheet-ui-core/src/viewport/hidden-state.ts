import { atom, type Getter, type Setter } from '@einfach/core'
import type { ViewportFilterHiddenState } from './types'

/** 原生完整隐藏集合的投影；手动与筛选来源分开，不存单元格数据。 */
export interface SheetVisibilityProjection {
  readonly manualRows: readonly number[]
  readonly manualColumns: readonly number[]
  readonly filterRows: readonly number[]
}

export const sheetHiddenRowsBackingAtom = atom<Record<string, number[]>>({})
export const viewportHiddenColsBackingAtom = atom<Record<string, number[]>>({})
export const viewportFilterHiddenBackingAtom = atom<ViewportFilterHiddenState>({ rowsBySheet: {} })
sheetHiddenRowsBackingAtom.debugLabel = 'spreadsheet.viewport.hiddenRowsBacking'
viewportHiddenColsBackingAtom.debugLabel = 'spreadsheet.viewport.hiddenColsBacking'
viewportFilterHiddenBackingAtom.debugLabel = 'spreadsheet.viewport.filterHiddenBacking'

export function validSheetVisibility(value: unknown): value is SheetVisibilityProjection {
  if (typeof value !== 'object' || value === null) return false
  const source = value as SheetVisibilityProjection
  return (
    [
      ['manualRows', 1_048_576],
      ['manualColumns', 16_384],
      ['filterRows', 1_048_576],
    ] as const
  ).every(
    ([key, bound]) =>
      Array.isArray(source[key]) &&
      source[key].length <= bound &&
      source[key].every(
        (index, at, list) =>
          Number.isSafeInteger(index) &&
          index >= 0 &&
          index < bound &&
          (at === 0 || index > list[at - 1]!),
      ),
  )
}

/** 已通过关联/版本校验的完整结果才覆盖缓存；未变化时保持引用，避免反复请求窗口。 */
export function applySheetVisibility(
  get: Getter,
  set: Setter,
  sheetId: string,
  state: SheetVisibilityProjection,
): void {
  if (!validSheetVisibility(state)) throw new Error('Invalid Rust visibility projection.')
  for (const [target, indices] of [
    [sheetHiddenRowsBackingAtom, state.manualRows],
    [viewportHiddenColsBackingAtom, state.manualColumns],
  ] as const) {
    const map = get(target)
    const previous = map[sheetId] ?? []
    if (previous.length !== indices.length || previous.some((n, i) => n !== indices[i]))
      set(target, { ...map, [sheetId]: [...indices] })
  }
  const filter = get(viewportFilterHiddenBackingAtom)
  const previous = filter.rowsBySheet[sheetId] ?? []
  if (
    previous.length !== state.filterRows.length ||
    previous.some((n, i) => n !== state.filterRows[i])
  )
    set(viewportFilterHiddenBackingAtom, {
      rowsBySheet: { ...filter.rowsBySheet, [sheetId]: [...state.filterRows] },
    })
}
