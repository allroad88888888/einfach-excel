import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import {
  applyVisibleProjectionAtom, createVisibleProjectionRequest,
  issueProjectionRequestIdAtom, projectionSnapshotAtom,
} from '../projection'
import { validateProjectionResult } from '../projection/contracts'
import { applyProjectionSizes } from '../projection/projection-sizes'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { selectionSnapshotAtom, selectionRegionsAtom } from '../selection'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'
import { selectionMergeFeedbackAtom } from '../toolbar/selection-merge-state'
import { systemClipboardFeedbackAtom } from '../clipboard/system-clipboard-command'
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import type { RustFillRangeRequest } from '../rust-workbook/commands'

const feedbackAtom = atom({ busy: false, error: '', message: '' })
export const directionalFillFeedbackAtom = atom((get) => get(feedbackAtom))

/** 填充入口只传选项；当前选区、原生写入及结果发布都在一个 command 内。 */
export const fillSelectionAtom = atom(null, async (
  get, set, input: 'down' | 'right' | Pick<RustFillRangeRequest, 'direction' | 'series'>,
): Promise<boolean> => {
  const { direction, series } = typeof input === 'string' ? { direction: input, series: undefined } : input
  if (get(feedbackAtom).busy || get(editingSessionAtom).source !== null ||
    get(selectionStructureFeedbackAtom).busy || get(selectionMergeFeedbackAtom).busy ||
    get(systemClipboardFeedbackAtom).busy) return false
  const connection = get(rustWorkbookConnectionAtom)
  const selection = get(selectionSnapshotAtom)
  const sheetId = selection.selection.sheetId
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  if (!connection || !sheetId || visible?.kind !== 'visible-window' || visible.sheetId !== sheetId) return false
  const fail = (error: string) => { set(feedbackAtom, { busy: false, error, message: '' }); return false }
  if (get(selectionRegionsAtom).length !== 1) return fail('Select one continuous fill range.')
  const { range } = selection
  if ((direction === 'down' ? range.rowEnd - range.rowStart : range.colEnd - range.colStart) < 1)
    return fail('Include a source row or column and at least one destination.')
  if (getSheetProtection(get(sheetProtectionAtom), sheetId).mode === 'protected')
    return fail('Unprotect the worksheet before filling cells.')
  if (set(resolveContentMutationAtom, { kind: 'clear-range', sheetId, range }).status === 'blocked')
    return fail('The selected range cannot be changed.')
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return false
  const projection = createVisibleProjectionRequest({
    sheetId, requestId, window: visible.window, viewport: visible.viewport, reason: 'toolbar',
  })
  const busy = { busy: true, error: '', message: `Filling ${direction}…` }
  set(feedbackAtom, busy)
  try {
    const pending = connection.request('range.fill', {
      request: { sheetId, requestId, range, direction, ...(series ? { series } : {}) }, projection,
    })
    // 同步 guard 先阻止重复写入；异步续体通知 React，不能等 Worker 返回才禁用菜单。
    await Promise.resolve()
    set(feedbackAtom, busy)
    const result = await pending
    if (get(rustWorkbookConnectionAtom) !== connection) return false
    const ack = result.acknowledgement
    if (ack.sheetId !== sheetId || ack.requestId !== requestId ||
      ack.revision !== result.projection.revision ||
      !validateProjectionResult(result.projection, { request: projection }).ok)
      throw new Error('Rust returned a mismatched fill result.')
    applyProjectionSizes(get, set, { ...result.projection, window: range, ...result.sizes })
    set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
    set(feedbackAtom, { busy: false, error: '', message: `Filled ${direction}.` })
    return true
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  } finally {
    if (get(feedbackAtom).busy) set(feedbackAtom, { busy: false, error: '', message: '' })
  }
})
