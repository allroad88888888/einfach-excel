import { atom } from '@einfach/core'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { quickFormulaAvailableAtom } from '../quick-formula/command'
import { nativeTableFeedbackAtom } from '../tables/native-feedback'
import {
  applyVisibleProjectionAtom, createVisibleProjectionRequest,
  issueProjectionRequestIdAtom, projectionSnapshotAtom,
} from '../projection'
import { validateProjectionResult } from '../projection/contracts'
import type { RustWorkbookConnection } from '../rust-workbook/commands'

type Scope = 'sheet' | 'workbook'
const EMPTY = { busy: false, error: null as string | null, message: null as string | null }
const feedbackAtom = atom({ ...EMPTY, connection: null as RustWorkbookConnection | null })
export const calculationFeedbackAtom = atom((get) => {
  const state = get(feedbackAtom)
  return state.connection === get(rustWorkbookConnectionAtom) ? state : EMPTY
})
export const calculationAvailableAtom = atom((get) => {
  const projection = get(projectionSnapshotAtom)
  const feedback = get(feedbackAtom)
  return get(quickFormulaAvailableAtom) && !get(nativeTableFeedbackAtom).busy &&
    !(feedback.connection === get(rustWorkbookConnectionAtom) && feedback.busy) &&
    projection.status === 'ready' &&
    projection.request?.sheetId === get(activeWorkbookSheetAtom)?.id
})

/** 一次原生重算返回当前投影；没有第二次刷新，也不触碰编辑草稿或历史。 */
export const recalculateAtom = atom(null, async (get, set, scope: Scope): Promise<boolean> => {
  if (!get(calculationAvailableAtom) || !['sheet', 'workbook'].includes(scope)) return false
  const connection = get(rustWorkbookConnectionAtom)!
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  if (visible?.kind !== 'visible-window') return false
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return false
  const projection = createVisibleProjectionRequest({ sheetId: visible.sheetId,
    window: visible.window, viewport: visible.viewport, requestId, reason: 'toolbar' })
  const pending = { ...EMPTY, connection, busy: true }
  set(feedbackAtom, pending)
  try {
    const response = connection.request('formula.recalculate', { scope, projection })
    await Promise.resolve()
    if (get(rustWorkbookConnectionAtom) === connection) set(feedbackAtom, pending)
    const result = await response
    if (get(rustWorkbookConnectionAtom) !== connection) return false
    if (!Number.isSafeInteger(result.formulaCount) || result.formulaCount < 0 ||
      !validateProjectionResult(result.projection, { request: projection }).ok)
      throw new Error('Rust returned an invalid calculation result.')
    set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
    set(feedbackAtom, { ...EMPTY, connection,
      message: `${scope === 'sheet' ? 'Worksheet' : 'Workbook'} recalculated (${result.formulaCount} formulas).` })
    return true
  } catch (cause) {
    if (get(rustWorkbookConnectionAtom) !== connection) return false
    set(feedbackAtom, { ...EMPTY, connection,
      error: cause instanceof Error ? cause.message : String(cause) })
    return false
  } finally {
    if (get(feedbackAtom) === pending) set(feedbackAtom, { ...EMPTY, connection })
  }
})
