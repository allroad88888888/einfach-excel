import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom, workbookDocumentAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import { editingSessionAtom } from '../editing/session-atoms'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import {
  applyVisibleProjectionAtom, createVisibleProjectionRequest,
  issueProjectionRequestIdAtom, projectionSnapshotAtom,
} from '../projection'
import { validateProjectionResult } from '../projection/contracts'
import type { ProjectionRevision } from '../backend'
import type { NamedRangeChange } from './native-types'

// 两个名称入口共用一份忙碌状态；更换工作簿后旧请求不能锁住新工作簿。
const pendingConnectionAtom = atom<RustWorkbookConnection | null>(null)
export const nativeNameChangeBusyAtom = atom((get) => Boolean(
  get(rustWorkbookConnectionAtom) &&
  get(pendingConnectionAtom) === get(rustWorkbookConnectionAtom),
))

/** 名称事实只由 Rust 修改，一次返回投影；调用者只负责自己的草稿反馈。 */
export const changeNativeNamedRangeAtom = atom(null, async (get, set,
  input: { action: NamedRangeChange; revision?: ProjectionRevision },
): Promise<boolean> => {
  const sheet = get(activeWorkbookSheetAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (!sheet || !connection || get(nativeNameChangeBusyAtom)) return false
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  const result = witness.result
  if (witness.status !== 'ready' || visible?.kind !== 'visible-window' ||
    visible.sheetId !== sheet.id || result?.kind !== 'visible-window' ||
    result.sheetId !== sheet.id || result.revision === undefined ||
    result.namedRanges === undefined)
    throw new Error('Wait for the Rust worksheet to finish loading.')
  if (get(editingSessionAtom).source || get(rustHistoryPanelAtom).busy ||
    get(sheetTabsAtom).mutation)
    throw new Error('Finish the current edit or history operation first.')
  if (get(workbookDocumentAtom).sheets.some((s) =>
    getSheetProtection(get(sheetProtectionAtom), s.id).mode === 'protected'))
    throw new Error('Unprotect the worksheets before changing workbook names.')
  if (input.revision !== undefined && input.revision !== result.revision)
    throw new Error('The workbook changed. Reopen the name editor.')
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return false
  const projection = createVisibleProjectionRequest({ sheetId: sheet.id, requestId,
    window: visible.window, viewport: visible.viewport, reason: 'toolbar' })
  set(pendingConnectionAtom, connection)
  try {
    const response = connection.request('namedRange.change', {
      sheetId: sheet.id, action: input.action, revision: result.revision, projection,
    })
    // 同步占用防重复提交；离开 command 写事务后向订阅视图发布忙碌状态。
    await Promise.resolve()
    if (get(pendingConnectionAtom) === connection) set(pendingConnectionAtom, connection)
    const reply = await response
    if (get(rustWorkbookConnectionAtom) !== connection ||
      get(activeWorkbookSheetAtom)?.id !== sheet.id)
      return false
    if (!validateProjectionResult(reply.projection, { request: projection }).ok ||
      reply.projection.namedRanges === undefined)
      throw new Error('Rust returned a mismatched named-range result.')
    const applied = set(applyVisibleProjectionAtom, {
      witness, request: projection, result: reply.projection,
    })
    if (applied.status !== 'applied') throw new Error('The view changed. Reopen the name editor.')
    return true
  } catch (error) {
    if (get(rustWorkbookConnectionAtom) !== connection ||
      get(activeWorkbookSheetAtom)?.id !== sheet.id)
      return false
    throw error
  } finally {
    if (get(pendingConnectionAtom) === connection) set(pendingConnectionAtom, null)
  }
})
