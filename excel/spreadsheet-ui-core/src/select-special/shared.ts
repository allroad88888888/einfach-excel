import { atom } from '@einfach/core'
import type { Getter, Setter } from '@einfach/core'
import { quickFormulaAvailableAtom } from '../quick-formula/command'
import { nativeTableFeedbackAtom } from '../tables/native-feedback'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { projectionSnapshotAtom } from '../projection'
import {
  selectionAuthorityWitnessAtom,
  selectionSnapshotAtom,
  setMultiRegionSelectionAtom,
} from '../selection'
import type { CellRange } from '../shared'
import { scrollToCellAtom } from '../viewport/metrics'

interface SelectSpecialFeedback {
  readonly busy: boolean
  readonly error: string | null
  readonly notice: string
}

const IDLE: SelectSpecialFeedback = { busy: false, error: null, notice: '' }
export const selectSpecialStateAtom = atom<SelectSpecialFeedback>(IDLE)
selectSpecialStateAtom.debugLabel = 'spreadsheet.selectSpecial.state'
/** 只读反馈：忙碌、错误与成功提示；快捷键和对话框共用。 */
export const selectSpecialFeedbackAtom = atom((get) => get(selectSpecialStateAtom))
selectSpecialFeedbackAtom.debugLabel = 'spreadsheet.selectSpecial.feedback'

export const selectSpecialAvailableAtom = atom(
  (get) =>
    get(quickFormulaAvailableAtom) &&
    !get(nativeTableFeedbackAtom).busy &&
    !get(selectSpecialStateAtom).busy,
)
selectSpecialAvailableAtom.debugLabel = 'spreadsheet.selectSpecial.available'

export const clearSelectSpecialFeedbackAtom = atom(null, (_get, set) => {
  set(selectSpecialStateAtom, IDLE)
})
clearSelectSpecialFeedbackAtom.debugLabel = 'spreadsheet.selectSpecial.clearFeedback'

const valid = (range: CellRange, rows: number, cols: number): boolean =>
  [range?.rowStart, range?.colStart, range?.rowEnd, range?.colEnd].every(
    (n) => Number.isSafeInteger(n) && (n as number) >= 0,
  ) &&
  range.rowStart <= range.rowEnd &&
  range.colStart <= range.colEnd &&
  range.rowEnd < rows &&
  range.colEnd < cols

/** 查询前捕获凭证；回复到达时任何变化都说明结果已过期。 */
export function beginNativeSelection(get: Getter, set: Setter) {
  const connection = get(rustWorkbookConnectionAtom)
  const sheet = get(activeWorkbookSheetAtom)
  if (!connection || !sheet || !get(selectSpecialAvailableAtom)) return null
  const pending = { ...IDLE, busy: true }
  set(selectSpecialStateAtom, pending)
  return {
    connection,
    sheet,
    authority: get(selectionAuthorityWitnessAtom),
    pending,
    active: get(selectionSnapshotAtom).activeCell,
  }
}

export type NativeSelectionContext = NonNullable<ReturnType<typeof beginNativeSelection>>

export function fail(set: Setter, error: string): false {
  set(selectSpecialStateAtom, { ...IDLE, error })
  return false
}

/** 回复仍属于发起时的连接、工作表、选区与修订版时返回 true。 */
export function isCurrent(get: Getter, context: NativeSelectionContext, revision: number): boolean {
  if (get(selectSpecialStateAtom) !== context.pending) return false
  if (get(rustWorkbookConnectionAtom) !== context.connection)
    throw new Error('The workbook changed. Try again.')
  if (get(activeWorkbookSheetAtom) !== context.sheet) throw new Error('The worksheet changed. Try again.')
  if (get(selectionAuthorityWitnessAtom) !== context.authority)
    throw new Error('The selection changed. Try again.')
  const current = get(projectionSnapshotAtom).result?.revision
  if (!Number.isSafeInteger(revision) || revision < 0 || (typeof current === 'number' && revision < current))
    throw new Error('The workbook changed. Try again.')
  return true
}

export function assertBlocks(
  blocks: readonly CellRange[],
  context: NativeSelectionContext,
  cellCount: number,
): void {
  const { rowCount, colCount } = context.sheet
  let area = 0
  for (const block of blocks) {
    if (!valid(block, rowCount, colCount)) throw new Error('The native result is outside the worksheet.')
    area += (block.rowEnd - block.rowStart + 1) * (block.colEnd - block.colStart + 1)
  }
  if (area !== cellCount) throw new Error('The native result is inconsistent.')
}

/** 活动格若正好是块的一角就保持不动；否则以左上角为活动格。 */
function regionFor(sheetId: string, block: CellRange, active: { row: number; col: number } | null) {
  const rowCorner = active && (active.row === block.rowStart || active.row === block.rowEnd)
  const colCorner = active && (active.col === block.colStart || active.col === block.colEnd)
  const focus =
    active && rowCorner && colCorner ? active : { row: block.rowStart, col: block.colStart }
  const anchor = {
    row: focus.row === block.rowStart ? block.rowEnd : block.rowStart,
    col: focus.col === block.colStart ? block.colEnd : block.colStart,
  }
  return { kind: 'range' as const, sheetId, anchor, focus }
}

/** 一次写入全部块，并滚动到主块的活动格。 */
export function publishBlocks(
  set: Setter,
  context: NativeSelectionContext,
  blocks: readonly CellRange[],
  notice: string,
): void {
  const active = context.active
  const primaryIndex = Math.max(
    0,
    blocks.findIndex(
      (b) =>
        active.row >= b.rowStart && active.row <= b.rowEnd &&
        active.col >= b.colStart && active.col <= b.colEnd,
    ),
  )
  set(setMultiRegionSelectionAtom, {
    regions: blocks.map((block, index) =>
      regionFor(context.sheet.id, block, index === primaryIndex ? active : null)),
    primaryIndex,
  })
  const focus = regionFor(context.sheet.id, blocks[primaryIndex], active).focus
  set(scrollToCellAtom, { coord: focus, rowAlign: 'nearest', colAlign: 'nearest' })
  set(selectSpecialStateAtom, { ...IDLE, notice })
}
