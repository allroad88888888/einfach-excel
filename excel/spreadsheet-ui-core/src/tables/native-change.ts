import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom, workbookDocumentAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { editingSessionAtom } from '../editing/session-atoms'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import { applyVisibleProjectionAtom, createVisibleProjectionRequest,
  issueProjectionRequestIdAtom, projectionSnapshotAtom } from '../projection'
import { validateProjectionResult } from '../projection/contracts'
import type { TableChange } from './native-types'
import { nativeTableFeedbackAtom, nativeTableFeedbackBackingAtom as feedbackAtom } from './native-feedback'

/** 唯一 Table 写入口：Rust 一次事务，接收并发布其返回投影，不乐观改写表目录。 */
export const changeNativeTableAtom = atom(null, async (get, set, change: TableChange) => {
  const connection = get(rustWorkbookConnectionAtom)
  const sheet = get(activeWorkbookSheetAtom)
  if (!connection || !sheet || get(nativeTableFeedbackAtom).busy) return null
  const fail = (error: string) => {
    set(feedbackAtom, { connection, busy: false, error })
    return null
  }
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  const result = witness.result
  if (witness.status !== 'ready' || visible?.kind !== 'visible-window' ||
    result?.kind !== 'visible-window' || visible.sheetId !== sheet.id ||
    result.sheetId !== sheet.id || result.revision === undefined || result.tables === undefined)
    return fail('Wait for the Rust worksheet to finish loading.')
  if (get(editingSessionAtom).source || get(rustHistoryPanelAtom).busy ||
    get(sheetTabsAtom).mutation)
    return fail('Finish the current edit or history operation first.')
  // Table 结构化引用可跨表；保护任一表时不能改写工作簿消费者。
  if (get(workbookDocumentAtom).sheets.some((s) =>
    getSheetProtection(get(sheetProtectionAtom), s.id).mode === 'protected'))
    return fail('Unprotect the worksheets before changing tables.')
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return fail('Table request identity space is exhausted.')
  const projection = createVisibleProjectionRequest({ sheetId: sheet.id, requestId,
    window: visible.window, viewport: visible.viewport, reason: 'toolbar' })
  const pending = { connection, busy: true, error: null }
  set(feedbackAtom, pending)
  try {
    const response = connection.request('table.change', {
      sheetId: sheet.id, action: change, revision: result.revision, projection,
    })
    await Promise.resolve()
    if (get(feedbackAtom) === pending) set(feedbackAtom, pending)
    const reply = await response
    if (get(rustWorkbookConnectionAtom) !== connection ||
      get(activeWorkbookSheetAtom)?.id !== sheet.id)
      return null
    if (!validateProjectionResult(reply.projection, { request: projection }).ok ||
      reply.projection.tables === undefined)
      throw new Error('Rust returned a mismatched table result.')
    const applied = set(applyVisibleProjectionAtom, {
      witness, request: projection, result: reply.projection,
    })
    if (applied.status !== 'applied') throw new Error('The view changed. Reopen Tables.')
    return reply.projection
  } catch (error) {
    if (get(rustWorkbookConnectionAtom) !== connection ||
      get(activeWorkbookSheetAtom)?.id !== sheet.id)
      return null
    return fail(error instanceof Error ? error.message : String(error))
  } finally {
    if (get(feedbackAtom) === pending) set(feedbackAtom, { connection, busy: false, error: null })
  }
})
