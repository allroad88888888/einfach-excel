import { atom } from '@einfach/core'
import type { NativeDataValidationRule } from './native-rule'
import type { RustWorkbookConnection } from '../rust-workbook'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { selectionSnapshotAtom } from '../selection'
import { projectionSnapshotAtom } from '../projection'
import { mergeRangeAt } from '../shared/merge'
import { startCellEditingFromProjectionAtom } from '../editing/start-cell-editing'
import { commitCellEditingAtom } from '../editing/commit-cell-editing'
import { editingSessionAtom } from '../editing/session-atoms'
import { rustHistoryPanelAtom } from '../history/rust-history-command'

interface Target { sheetId: string; row: number; col: number }
export const nativeValidationTargetAtom = atom((get): Target | null => {
  const cell = get(selectionSnapshotAtom).activeCell
  if (cell.sheetId !== get(activeWorkbookSheetAtom)?.id) return null
  const result = get(projectionSnapshotAtom).result
  if (result?.kind !== 'visible-window' || result.sheetId !== cell.sheetId) return null
  const merge = mergeRangeAt(result.mergedRanges ?? [], cell)
  return { sheetId: cell.sheetId,
    row: merge?.rowStart ?? cell.row, col: merge?.colStart ?? cell.col }
})
interface ListState {
  target: Target | null
  connection: RustWorkbookConnection | null
  rule: NativeDataValidationRule | null
  busy: boolean
  error: string
}
const EMPTY: ListState = { target: null, connection: null, rule: null, busy: false, error: '' }
export const nativeValidationListAtom = atom<ListState>(EMPTY)
const sameTarget = (a: Target | null, b: Target | null) =>
  a?.sheetId === b?.sheetId && a?.row === b?.row && a?.col === b?.col

/** 只读取活动格规则，不随滚动发送全表目录，不让迟到结果覆盖新选区。 */
export const refreshNativeValidationListAtom = atom(null, async (get, set): Promise<void> => {
  const target = get(nativeValidationTargetAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (!target || !connection) { set(nativeValidationListAtom, EMPTY); return }
  const pending: ListState = { ...EMPTY, target, connection, busy: true }
  set(nativeValidationListAtom, pending)
  const current = () => get(nativeValidationListAtom) === pending &&
    get(rustWorkbookConnectionAtom) === connection &&
    sameTarget(get(nativeValidationTargetAtom), target)
  try {
    const rule = await connection.request('validation.read', target)
    if (current()) set(nativeValidationListAtom, { ...pending, rule, busy: false })
  } catch (error) {
    if (current()) set(nativeValidationListAtom, { ...pending, busy: false,
      error: error instanceof Error ? error.message : String(error) })
  }
})

/** 下拉选择复用普通编辑提交，保护权限、失败草稿与一次投影都只有原来的实现。 */
export const chooseNativeValidationItemAtom = atom(null, async (get, set, index: number) => {
  const state = get(nativeValidationListAtom)
  const target = get(nativeValidationTargetAtom)
  if (!target || state.busy || state.rule?.kind !== 'list' ||
    state.connection !== get(rustWorkbookConnectionAtom) || !sameTarget(target, state.target) ||
    get(editingSessionAtom).source || get(rustHistoryPanelAtom).busy ||
    !Number.isInteger(index) || index < 0 || index >= state.rule.items.length) return 'blocked'
  // 选项是明确的文字选择；前置引号防止 = 开头的选项变成公式，也保留前导零。
  const started = set(startCellEditingFromProjectionAtom, { sheetId: target.sheetId,
    cell: { row: target.row, col: target.col }, initialDraft: `'${state.rule.items[index]}` })
  return started ? set(commitCellEditingAtom) : 'blocked'
})
