import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import { applyVisibleProjectionAtom, createVisibleProjectionRequest,
  issueProjectionRequestIdAtom, projectionSnapshotAtom } from '../projection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook'
import type { RustRemoveDuplicatesRequest, RustRemoveDuplicatesPreview } from '../rust-workbook/remove-duplicates-commands'
import { selectionAuthorityWitnessAtom, selectionRegionsAtom, selectionSnapshotAtom,
  type SelectionAuthorityWitness } from '../selection'

type Draft = Pick<RustRemoveDuplicatesRequest, 'columns' | 'hasHeader' | 'comparison'>
interface Panel {
  target: { sheetId: string; range: RustRemoveDuplicatesRequest['range'];
    connection: RustWorkbookConnection; witness: SelectionAuthorityWitness } | null
  draft: Draft
  preview: (RustRemoveDuplicatesPreview & {
    revision: number; request: RustRemoveDuplicatesRequest
  }) | null
  status: 'idle' | 'previewing' | 'applying'
  confirmed: boolean
  error: string | null
}
const CLOSED: Panel = { target: null, draft: { columns: [], hasHeader: true, comparison: 'ignoreCase' },
  preview: null, status: 'idle', confirmed: false, error: null }

/** 只有选项和有限预览；完整数据、重复判定、压紧及撤销均留在 Rust。 */
export const nativeDuplicatesPanelAtom = atom<Panel>(CLOSED)
export type NativeDuplicatesAction = 'open' | 'close' | 'preview' | 'apply'
  | { type: 'draft'; patch: Partial<Draft> } | { type: 'confirm'; value: boolean }

export const runNativeDuplicatesPanelAtom = atom(null, async (
  get, set, action: NativeDuplicatesAction,
) => {
  const state = get(nativeDuplicatesPanelAtom)
  if (state.status === 'applying') return false
  if (action === 'close') { set(nativeDuplicatesPanelAtom, CLOSED); return true }
  const connection = get(rustWorkbookConnectionAtom)
  const fail = (error: string) => {
    set(nativeDuplicatesPanelAtom, { ...get(nativeDuplicatesPanelAtom),
      status: 'idle', preview: null, confirmed: false, error })
    return false
  }
  if (!connection || get(editingSessionAtom).source) return false
  if (action !== 'open' && (!state.target || state.target.connection !== connection ||
    state.target.witness !== get(selectionAuthorityWitnessAtom)))
    return fail('The selection or workbook changed. Close this dialog and select the range again.')
  if (typeof action === 'object') {
    if (action.type === 'confirm') {
      if (state.status !== 'idle' || !state.preview) return false
      set(nativeDuplicatesPanelAtom, { ...state, confirmed: action.value })
    } else {
      set(nativeDuplicatesPanelAtom, { ...state, draft: { ...state.draft, ...action.patch },
        preview: null, confirmed: false, error: null, status: 'idle' })
    }
    return true
  }
  if (action === 'open' || action === 'preview') {
    const selection = get(selectionSnapshotAtom)
    const range = selection.range
    const pending: Panel = action === 'open' ? {
      ...CLOSED, target: { sheetId: selection.selection.sheetId, range: { ...range },
        connection, witness: get(selectionAuthorityWitnessAtom) },
      draft: { ...CLOSED.draft, columns: Array.from(
        { length: Math.min(256, range.colEnd - range.colStart + 1) },
        (_, i) => range.colStart + i) },
      status: 'previewing',
    } : { ...state, status: 'previewing', preview: null, confirmed: false, error: null }
    set(nativeDuplicatesPanelAtom, pending)
    if (get(selectionRegionsAtom).length !== 1) return fail('Select one continuous range.')
    if (!pending.draft.columns.length) return fail('Choose at least one comparison column.')
    const request: RustRemoveDuplicatesRequest = {
      sheetId: pending.target!.sheetId, range: pending.target!.range, ...pending.draft,
    }
    try {
      const response = connection.request('duplicates.preview', request)
      await Promise.resolve()
      if (get(nativeDuplicatesPanelAtom) === pending) set(nativeDuplicatesPanelAtom, pending)
      const preview = await response
      if (get(nativeDuplicatesPanelAtom) !== pending) return false
      if (get(rustWorkbookConnectionAtom) !== connection ||
        get(selectionAuthorityWitnessAtom) !== pending.target!.witness)
        return fail('The selection or workbook changed. Close this dialog and select the range again.')
      set(nativeDuplicatesPanelAtom, { ...pending, status: 'idle', preview: { ...preview, request } })
      return true
    } catch (error) {
      if (get(nativeDuplicatesPanelAtom) !== pending) return false
      return fail(error instanceof Error ? error.message : 'Could not preview duplicate records.')
    }
  }
  if (state.status !== 'idle' || !state.preview) return fail('Update the preview before removing records.')
  if (!state.confirmed || state.preview.removedRows === 0) return false
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  if (witness.status !== 'ready' || visible?.kind !== 'visible-window' ||
    visible.sheetId !== state.target!.sheetId) return fail('Wait for the worksheet to finish loading.')
  const gate = set(resolveContentMutationAtom, {
    kind: 'remove-duplicates', sheetId: state.target!.sheetId, range: state.target!.range,
  })
  if (gate.status === 'blocked') return fail(gate.diagnostic.message)
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return fail('Could not allocate a projection request.')
  const projection = createVisibleProjectionRequest({ sheetId: visible.sheetId,
    window: visible.window, viewport: visible.viewport, requestId, reason: 'toolbar' })
  const pending: Panel = { ...state, status: 'applying', error: null }
  set(nativeDuplicatesPanelAtom, pending)
  try {
    const response = connection.request('duplicates.apply', { ...state.preview.request,
      expectedRevision: state.preview.revision, projection })
    await Promise.resolve()
    if (get(nativeDuplicatesPanelAtom) === pending) set(nativeDuplicatesPanelAtom, pending)
    const result = await response
    if (get(nativeDuplicatesPanelAtom) !== pending) return false
    if (get(rustWorkbookConnectionAtom) !== connection) {
      set(nativeDuplicatesPanelAtom, CLOSED)
      return false
    }
    const applied = set(applyVisibleProjectionAtom, {
      witness, request: projection, result: result.projection,
    })
    if (applied.status === 'rejected')
      return fail('Records were removed, but the view could not be updated. Check the sheet before retrying.')
    set(nativeDuplicatesPanelAtom, CLOSED)
    return true
  } catch (error) {
    if (get(nativeDuplicatesPanelAtom) !== pending) return false
    return fail(error instanceof Error ? error.message : 'Could not confirm removal. Check the sheet before retrying.')
  }
})
