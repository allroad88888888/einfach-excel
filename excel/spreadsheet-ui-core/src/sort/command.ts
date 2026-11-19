import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import { applyVisibleProjectionAtom, createVisibleProjectionRequest,
  issueProjectionRequestIdAtom, projectionSnapshotAtom } from '../projection'
import { validateProjectionResult } from '../projection/contracts'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook'
import { selectionSnapshotAtom, selectionRegionsAtom } from '../selection'
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'
import { selectionMergeFeedbackAtom } from '../toolbar/selection-merge-state'
import { systemClipboardFeedbackAtom } from '../clipboard/system-clipboard-command'
import { directionalFillFeedbackAtom } from '../auto-fill/directional-command'
import type { SortRangeOptions } from '../rust-workbook/sort-commands'

const idle = { busy: false, error: '', message: '' }
const feedbackAtom = atom({ ...idle, connection: null as RustWorkbookConnection | null })
export const sortFeedbackAtom = atom((get) => {
  const feedback = get(feedbackAtom)
  return feedback.connection === get(rustWorkbookConnectionAtom)
    ? { busy: feedback.busy, error: feedback.error, message: feedback.message } : idle
})

/** 三个入口只改变排序键；统一经过原生写入并发布一次可见结果。 */
export const sortSelectionAtom = atom(null, async (
  get, set, options: 'asc' | 'desc' | SortRangeOptions,
): Promise<boolean> => {
  if (get(sortFeedbackAtom).busy || get(editingSessionAtom).source !== null ||
    get(selectionStructureFeedbackAtom).busy || get(selectionMergeFeedbackAtom).busy ||
    get(systemClipboardFeedbackAtom).busy || get(directionalFillFeedbackAtom).busy) return false
  const connection = get(rustWorkbookConnectionAtom)
  const selection = get(selectionSnapshotAtom)
  const sheetId = selection.selection.sheetId
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  if (!connection || !sheetId || visible?.kind !== 'visible-window' || visible.sheetId !== sheetId) return false
  const fail = (error: string) => {
    if (get(rustWorkbookConnectionAtom) === connection)
      set(feedbackAtom, { busy: false, error, message: '', connection })
    return false
  }
  const range = selection.range
  if (get(selectionRegionsAtom).length !== 1) return fail('Select one continuous sort range.')
  const settings: SortRangeOptions = typeof options === 'string'
    ? { keys: [{ col: range.colStart, direction: options }], hasHeader: false } : options
  if (settings.orientation === 'left-to-right') {
    if (range.colEnd <= range.colStart)
      return fail('Select at least two data columns. Include all rows to move together.')
  } else if (range.rowEnd <= range.rowStart) {
    return fail('Select at least two data rows. Include all columns to move together.')
  }
  if (getSheetProtection(get(sheetProtectionAtom), sheetId).mode === 'protected')
    return fail('Unprotect the worksheet before sorting cells.')
  if (set(resolveContentMutationAtom, { kind: 'clear-range', sheetId, range }).status === 'blocked')
    return fail('The selected range cannot be changed.')
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return false
  const projection = createVisibleProjectionRequest({
    sheetId, requestId, window: visible.window, viewport: visible.viewport, reason: 'toolbar',
  })
  const busy = { busy: true, error: '', message: 'Sorting…', connection }
  set(feedbackAtom, busy)
  try {
    const pending = connection.request('range.sort', { sheetId, range, ...settings, projection })
    await Promise.resolve()
    if (get(feedbackAtom) === busy) set(feedbackAtom, busy)
    const result = await pending
    if (get(rustWorkbookConnectionAtom) !== connection || get(feedbackAtom) !== busy) return false
    if (!validateProjectionResult(result.projection, { request: projection }).ok)
      throw new Error('Rust returned a mismatched sort result.')
    set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
    const message = result.movedColumns
      ? `Sorted ${result.movedColumns} columns.`
      : result.movedRows > 0 ? `Sorted ${result.movedRows} rows.` : 'Already in order.'
    set(feedbackAtom, { busy: false, error: '', connection, message })
    return true
  } catch (error) {
    return get(feedbackAtom) === busy
      ? fail(error instanceof Error ? error.message : String(error)) : false
  } finally {
    if (get(feedbackAtom) === busy) set(feedbackAtom, { ...idle, connection })
  }
})
