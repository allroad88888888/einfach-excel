import { atom } from '@einfach/core'
import { quickFormulaAvailableAtom } from '../quick-formula/command'
import { nativeTableFeedbackAtom } from '../tables/native-feedback'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { selectionAuthorityWitnessAtom, selectionRegionsAtom, selectionSnapshotAtom,
  setMultiRegionSelectionAtom } from '../selection'
import { projectionSnapshotAtom } from '../projection'
import { scrollToCellAtom } from '../viewport/metrics'
import { rangeToA1 } from '../name-box/address'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import type { LocatedCells, LocateKind } from '../rust-workbook/find-commands'
import type { CellRange } from '../shared'
import { GO_TO_REGION_CAP } from './types'

const EMPTY = { open: false, busy: false, error: null as string | null, notice: '' }
const stateAtom = atom({ ...EMPTY, connection: null as RustWorkbookConnection | null })
const canQueryAtom = atom((get) =>
  get(quickFormulaAvailableAtom) && !get(nativeTableFeedbackAtom).busy)
export const goToSpecialAvailableAtom = atom((get) => get(canQueryAtom) &&
  !(get(stateAtom).connection === get(rustWorkbookConnectionAtom) && get(stateAtom).busy))
export const goToSpecialPanelAtom = atom((get) => {
  const state = get(stateAtom)
  const sheet = get(activeWorkbookSheetAtom)
  const selection = get(selectionSnapshotAtom)
  const single = selection.range.rowStart === selection.range.rowEnd &&
    selection.range.colStart === selection.range.colEnd
  const range = sheet && single ? { rowStart: 0, colStart: 0,
    rowEnd: sheet.rowCount - 1, colEnd: sheet.colCount - 1 } : selection.range
  return { ...(state.connection === get(rustWorkbookConnectionAtom) ? state : EMPTY), range,
    scope: `${single ? 'Entire worksheet canvas' : 'Selected range'}: ${rangeToA1(range)}`,
    continuous: get(selectionRegionsAtom).length === 1 }
})

function validRange(range: CellRange, rows: number, cols: number): boolean {
  return Boolean(range && [range.rowStart, range.colStart, range.rowEnd, range.colEnd]
    .every((n) => Number.isSafeInteger(n) && n >= 0) &&
    range.rowStart <= range.rowEnd && range.colStart <= range.colEnd &&
    range.rowEnd < rows && range.colEnd < cols)
}

/** 只验证协议几何；不重新遍历工作簿内容来判定命中。 */
function validResult(result: LocatedCells, range: CellRange, rows: number, cols: number): boolean {
  if (!result || !validRange(result.scope, rows, cols) || !Array.isArray(result.ranges) ||
    result.ranges.length > GO_TO_REGION_CAP ||
    !Number.isSafeInteger(result.cellCount) || result.cellCount < 0)
    return false
  const contains = (outer: CellRange, inner: CellRange) => outer.rowStart <= inner.rowStart &&
    outer.rowEnd >= inner.rowEnd && outer.colStart <= inner.colStart && outer.colEnd >= inner.colEnd
  if (!contains(result.scope, range)) return false
  let count = 0
  for (const [index, region] of result.ranges.entries()) {
    if (!validRange(region, rows, cols) || !contains(result.scope, region)) return false
    if (result.ranges.slice(0, index).some((other) => other.rowStart <= region.rowEnd &&
      other.rowEnd >= region.rowStart &&
      other.colStart <= region.colEnd && other.colEnd >= region.colStart))
      return false
    count += (region.rowEnd - region.rowStart + 1) * (region.colEnd - region.colStart + 1)
  }
  return count === result.cellCount
}

/** 一个只读往返后原子发布全部区域；失败、取消或过期回复都不碰原选区。 */
export const runGoToSpecialAtom = atom(null, async (get, set,
  action: 'open' | 'close' | LocateKind,
): Promise<boolean> => {
  if (action === 'close') { set(stateAtom, { ...get(stateAtom), ...EMPTY }); return true }
  if (!get(goToSpecialAvailableAtom)) return false
  const connection = get(rustWorkbookConnectionAtom)!
  const sheet = get(activeWorkbookSheetAtom)!
  if (action === 'open') { set(stateAtom, { ...EMPTY, connection, open: true }); return true }
  const panel = get(goToSpecialPanelAtom)
  if (!panel.open || !['constants', 'formulas', 'blanks'].includes(action)) return false
  if (!panel.continuous) {
    set(stateAtom, { ...get(stateAtom), error: 'Select one continuous range before using Go to special.' })
    return false
  }
  const authority = get(selectionAuthorityWitnessAtom)
  const pending = { ...EMPTY, connection, open: true, busy: true }
  set(stateAtom, pending)
  try {
    const response = connection.request('workbook.locate', {
      sheetId: sheet.id, range: panel.range, kind: action, limit: GO_TO_REGION_CAP,
    })
    await Promise.resolve()
    if (get(stateAtom) === pending) set(stateAtom, pending)
    const result = await response
    if (get(rustWorkbookConnectionAtom) !== connection || get(stateAtom) !== pending) return false
    if (!get(canQueryAtom) || get(activeWorkbookSheetAtom) !== sheet ||
      get(selectionAuthorityWitnessAtom) !== authority)
      throw new Error('The selection or worksheet changed. Try locating cells again.')
    const revision = get(projectionSnapshotAtom).result?.revision
    if (!Number.isSafeInteger(result.revision) || result.revision < 0 ||
      (typeof revision === 'number' && result.revision < revision))
      throw new Error('The workbook changed. Try locating cells again.')
    if (!validResult(result, panel.range, sheet.rowCount, sheet.colCount))
      throw new Error('The locate result is invalid or outside the current worksheet canvas.')
    if (!result.ranges.length) throw new Error('No matching cells found. Choose another condition or range.')
    set(setMultiRegionSelectionAtom, { regions: result.ranges.map((range) => ({
      kind: 'range' as const, sheetId: sheet.id,
      // focus 是活动格，须与下方滚动目标一致；反向 anchor 不改变选区范围。
      anchor: { row: range.rowEnd, col: range.colEnd },
      focus: { row: range.rowStart, col: range.colStart },
    })), primaryIndex: 0 })
    const first = result.ranges[0]
    set(scrollToCellAtom, { coord: { row: first.rowStart, col: first.colStart },
      rowAlign: 'nearest', colAlign: 'nearest' })
    set(stateAtom, { ...EMPTY, connection,
      notice: `Selected ${result.cellCount} cells in ${result.ranges.length} areas. Searched ${rangeToA1(result.scope)}.` })
    return true
  } catch (cause) {
    if (get(rustWorkbookConnectionAtom) !== connection || get(stateAtom) !== pending) return false
    set(stateAtom, { ...pending, busy: false,
      error: cause instanceof Error ? cause.message : String(cause) })
    return false
  }
})
