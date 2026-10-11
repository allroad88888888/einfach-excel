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
  if (!get(rustWorkbookConnectionAtom)) return null
  const cell = get(selectionSnapshotAtom).activeCell
  if (cell.sheetId !== get(activeWorkbookSheetAtom)?.id) return null
  const result = get(projectionSnapshotAtom).result
  if (result?.kind !== 'visible-window' || result.sheetId !== cell.sheetId) return null
  const merge = mergeRangeAt(result.mergedRanges ?? [], cell)
  return { sheetId: cell.sheetId,
    row: merge?.rowStart ?? cell.row, col: merge?.colStart ?? cell.col }
})
interface ListState {
  revision: string | number | undefined
  target: Target | null
  connection: RustWorkbookConnection | null
  rule: NativeDataValidationRule | null
  busy: boolean
  error: string
}
const EMPTY: ListState = { target: null, connection: null, revision: undefined,
  rule: null, busy: false, error: '' }
const listStateAtom = atom<ListState>(EMPTY)
const sameTarget = (a: Target | null, b: Target | null) =>
  a?.sheetId === b?.sheetId && a?.row === b?.row && a?.col === b?.col

/** React 只看展示状态；连接资源与迟到结果判断始终留在 UI Core。 */
export const nativeValidationListAtom = atom((get) => {
  const state = get(listStateAtom)
  const target = get(nativeValidationTargetAtom)
  const current = state.connection === get(rustWorkbookConnectionAtom) &&
    sameTarget(state.target, target) &&
    state.revision === get(projectionSnapshotAtom).result?.revision
  return { target, rule: current ? state.rule : null, busy: current && state.busy,
    error: current ? state.error : '', needsRefresh: target !== null && !current }
})

/** 只读取活动格规则，不随滚动发送全表目录，不让迟到结果覆盖新选区。 */
export const refreshNativeValidationListAtom = atom(null, async (get, set): Promise<void> => {
  const target = get(nativeValidationTargetAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (!target || !connection) { set(listStateAtom, EMPTY); return }
  const revision = get(projectionSnapshotAtom).result?.revision
  const pending: ListState = { ...EMPTY, target, connection, revision, busy: true }
  set(listStateAtom, pending)
  const current = () => get(listStateAtom) === pending &&
    get(rustWorkbookConnectionAtom) === connection &&
    sameTarget(get(nativeValidationTargetAtom), target) &&
    get(projectionSnapshotAtom).result?.revision === revision
  try {
    const rule = await connection.request('validation.read', target)
    if (current()) set(listStateAtom, { ...pending, rule, busy: false })
  } catch (error) {
    if (current()) set(listStateAtom, { ...pending, busy: false,
      error: error instanceof Error ? error.message : String(error) })
  }
})

/** 下拉选择复用普通编辑提交，保护权限、失败草稿与一次投影都只有原来的实现。 */
export const chooseNativeValidationItemAtom = atom(null, async (get, set, index: number) => {
  const state = get(listStateAtom)
  const target = get(nativeValidationTargetAtom)
  const projection = get(projectionSnapshotAtom)
  if (!target || state.busy || state.rule?.kind !== 'list' ||
    projection.status !== 'ready' || state.revision !== projection.result?.revision ||
    state.connection !== get(rustWorkbookConnectionAtom) || !sameTarget(target, state.target) ||
    get(editingSessionAtom).source || get(rustHistoryPanelAtom).busy ||
    !Number.isInteger(index) || index < 0 || index >= state.rule.items.length) return 'blocked'
  // 选项是明确的文字选择；前置引号防止 = 开头的选项变成公式，也保留前导零。
  const started = set(startCellEditingFromProjectionAtom, { sheetId: target.sheetId,
    cell: { row: target.row, col: target.col }, initialDraft: `'${state.rule.items[index]}` })
  return started ? set(commitCellEditingAtom) : 'blocked'
})
