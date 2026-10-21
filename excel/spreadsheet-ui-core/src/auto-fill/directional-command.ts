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
import { selectionSnapshotAtom, selectionRegionsAtom, setSelectionAtom } from '../selection'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'
import { selectionMergeFeedbackAtom } from '../toolbar/selection-merge-state'
import { systemClipboardFeedbackAtom } from '../clipboard/system-clipboard-command'
import type { RustFillRangeRequest, RustWorkbookCommands, RustWorkbookConnection } from '../rust-workbook/commands'
import type { ProjectionSnapshot } from '../projection'
import { rangeEquals } from '../shared'
import { offerNativeValidationConfirmationAtom } from '../data-validation/advanced/confirmation-state'

const feedbackAtom = atom({ busy: false, error: '', message: '' })
export const directionalFillFeedbackAtom = atom((get) => get(feedbackAtom))

/** 填充入口只传选项；当前选区、原生写入及结果发布都在一个 command 内。 */
export const fillSelectionAtom = atom(null, async (
  get, set, input: 'down' | 'right' | Pick<RustFillRangeRequest, 'direction' | 'series'> &
    Partial<Pick<RustFillRangeRequest, 'sourceRange' | 'range' | 'auto' | 'sheetId' | 'adjacent'>>,
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
  const drag = typeof input === 'object' && input.sourceRange ? input : null
  if (drag && (drag.sheetId !== sheetId || !rangeEquals(drag.sourceRange!, selection.range)))
    return fail('The fill source selection changed. Drag again.')
  const range = drag?.range ?? selection.range
  if (!drag?.adjacent &&
    ((direction === 'down' || direction === 'up') ? range.rowEnd - range.rowStart : range.colEnd - range.colStart) < 1)
    return fail('Include a source row or column and at least one destination.')
  // 来源只是读取，真实目的格及边框邻居由 Rust 全量预检，不能误锁来源。
  if (set(resolveContentMutationAtom, { kind: 'clear-range', sheetId, range,
    protectionGate: false }).status === 'blocked')
    return fail('The selected range cannot be changed.')
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return false
  const projection = createVisibleProjectionRequest({
    sheetId, requestId, window: visible.window, viewport: visible.viewport, reason: 'toolbar',
  })
  const payload = {
    request: { sheetId, requestId, range, direction, ...(series ? { series } : {}),
      ...(drag ? { sourceRange: drag.sourceRange, auto: drag.auto,
        ...(drag.adjacent ? { adjacent: drag.adjacent } : {}) } : {}) }, projection,
  }
  return set(resumeValidatedFillAtom, { connection, witness, payload })
})

/** 普通填充和用户明确 Continue 共享同一次发送、ACK及所有成功收尾。 */
export const resumeValidatedFillAtom = atom(null, async (get, set, input: {
  readonly connection: RustWorkbookConnection
  readonly witness: ProjectionSnapshot
  readonly payload: RustWorkbookCommands['range.fill']['payload']
}): Promise<boolean> => {
  const { connection, witness, payload } = input
  if (get(rustWorkbookConnectionAtom) !== connection) return false
  const { request, projection } = payload
  const { sheetId, requestId, range, direction, adjacent } = request
  const fail = (error: string) => { set(feedbackAtom, { busy: false, error, message: '' }); return false }
  const busy = { busy: true, error: '', message: `Filling ${direction}…` }
  set(feedbackAtom, busy)
  try {
    const pending = connection.request('range.fill', payload)
    // 同步 guard 先阻止重复写入；异步续体通知 React，不能等 Worker 返回才禁用菜单。
    await Promise.resolve()
    if (get(feedbackAtom) === busy) set(feedbackAtom, busy)
    const result = await pending
    if (get(rustWorkbookConnectionAtom) !== connection) return false
    const ack = result.acknowledgement
    if (ack.sheetId !== sheetId || ack.requestId !== requestId ||
      ack.revision !== result.projection.revision ||
      !validateProjectionResult(result.projection, { request: projection }).ok)
      throw new Error('Rust returned a mismatched fill result.')
    const target = adjacent ? { ...range, rowEnd: ack.affectedRange?.rowEnd ?? -1 } : range
    if (adjacent && (!ack.affectedRange ||
      ack.affectedRange.rowStart !== range.rowEnd + 1 ||
      ack.affectedRange.colStart !== range.colStart || ack.affectedRange.colEnd !== range.colEnd ||
      !Number.isSafeInteger(target.rowEnd) || target.rowEnd <= range.rowEnd ||
      target.rowEnd >= adjacent.rowLimit)) throw new Error('Rust returned a mismatched fill range.')
    // 双击的尺寸快照只覆盖实际写入行，不能拿它清理来源行已有的高度。
    applyProjectionSizes(get, set, { ...result.projection,
      window: adjacent ? ack.affectedRange! : target, ...result.sizes })
    set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
    const currentSelection = get(selectionSnapshotAtom)
    if (adjacent && currentSelection.selection.sheetId === sheetId &&
      rangeEquals(currentSelection.range, range)) {
      set(setSelectionAtom, { kind: 'range', sheetId,
        anchor: { row: target.rowStart, col: target.colStart },
        focus: { row: target.rowEnd, col: target.colEnd } })
    }
    set(feedbackAtom, { busy: false, error: '', message: `Filled ${direction}.` })
    return true
  } catch (error) {
    if (!request.validationConfirmation && get(rustWorkbookConnectionAtom) === connection)
      set(offerNativeValidationConfirmationAtom, { error, operation: { command: 'range.fill', payload }, witness })
    const failed = fail(error instanceof Error ? error.message : String(error))
    if (request.validationConfirmation === 'continue') throw error
    return failed
  } finally {
    if (get(feedbackAtom) === busy) set(feedbackAtom, { busy: false, error: '', message: '' })
  }
})
