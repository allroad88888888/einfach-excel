import { atom } from '@einfach/core'
import { toA1 } from '../backend'
import { parseA1Cell } from '../name-box'
import { editingSessionAtom } from '../editing/session-atoms'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import {
  applyVisibleProjectionAtom, createVisibleProjectionRequest,
  issueProjectionRequestIdAtom, projectionSnapshotAtom,
} from '../projection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook'
import type { RustTextColumnsPreview, RustTextColumnsRequest } from '../rust-workbook/text-columns-commands'
import {
  selectionAuthorityWitnessAtom, selectionRegionsAtom, selectionSnapshotAtom,
  setSelectionAtom, type SelectionAuthorityWitness,
} from '../selection'
import { scrollToCellAtom } from '../viewport/metrics'

interface Draft {
  kind: 'delimited' | 'fixedWidth'
  delimiters: string
  otherDelimiter: string
  mergeConsecutive: boolean
  qualifier: string | null
  breakpoints: string
  destination: string
}
interface Panel {
  target: {
    sheetId: string
    source: RustTextColumnsRequest['source']
    connection: RustWorkbookConnection
    witness: SelectionAuthorityWitness
  } | null
  draft: Draft
  preview: (RustTextColumnsPreview & { revision: number; request: RustTextColumnsRequest }) | null
  status: 'idle' | 'previewing' | 'applying'
  overwrite: boolean
  error: string | null
}
const CLOSED: Panel = {
  target: null, draft: { kind: 'delimited', delimiters: ',', otherDelimiter: '', mergeConsecutive: false,
    qualifier: '"', breakpoints: '2, 5', destination: '' },
  preview: null, status: 'idle', overwrite: false, error: null,
}

/** 只保存表单草稿和原生有限样本；源数据与拆分结果不在 atom 中计算。 */
export const textColumnsPanelAtom = atom<Panel>(CLOSED)
export type TextColumnsPanelAction = 'open' | 'close' | 'preview' | 'apply'
  | { type: 'draft'; patch: Partial<Draft> }
  | { type: 'overwrite'; value: boolean }
  | { type: 'delimiter'; value: string; enabled: boolean }

function requestFromDraft(state: Panel): RustTextColumnsRequest | string {
  const { draft, target } = state
  if (!target) return 'Select a source column first.'
  if (target.source.colStart !== target.source.colEnd) return 'Select one continuous column of cells.'
  const destination = parseA1Cell(draft.destination)
  if (!destination) return 'Enter a destination cell such as C1.'
  const breakpoints = draft.breakpoints.split(',').map((value) => Number(value.trim()))
  if (draft.kind === 'fixedWidth' && (!/^\s*\d+(\s*,\s*\d+)*\s*$/.test(draft.breakpoints) ||
    breakpoints.some((value, index) => !Number.isSafeInteger(value) || value <= 0 ||
      value > 0xffff_ffff || (index > 0 && value <= breakpoints[index - 1]!))))
    return 'Enter increasing positive character positions, for example 2, 5.'
  const delimiters = draft.delimiters + draft.otherDelimiter
  if (draft.kind === 'delimited' && !delimiters) return 'Choose at least one delimiter.'
  return {
    sheetId: target.sheetId, source: target.source, destination,
    mode: draft.kind === 'fixedWidth' ? { kind: 'fixedWidth', breakpoints }
      : { kind: 'delimited', delimiters: [...new Set([...delimiters])],
        mergeConsecutive: draft.mergeConsecutive, qualifier: draft.qualifier },
  }
}

/** 同一入口处理草稿、只读预览和原生应用；旧响应不能复活关闭的面板。 */
export const runTextColumnsPanelAtom = atom(null, async (
  get, set, action: TextColumnsPanelAction,
) => {
  const state = get(textColumnsPanelAtom)
  if (state.status === 'applying') return false
  if (action === 'close') {
    set(textColumnsPanelAtom, CLOSED)
    return true
  }
  const connection = get(rustWorkbookConnectionAtom)
  const fail = (error: string) => {
    set(textColumnsPanelAtom, { ...get(textColumnsPanelAtom), status: 'idle', error })
    return false
  }
  if (action !== 'open') {
    if (!state.target) return false
    if (state.target.connection !== connection ||
      state.target.witness !== get(selectionAuthorityWitnessAtom))
      return fail('The selection or workbook changed. Close this dialog and select the source again.')
  }
  if (!connection || get(editingSessionAtom).source) return false
  if (typeof action === 'object') {
    if (action.type === 'overwrite') {
      if (!state.preview || state.status !== 'idle') return false
      set(textColumnsPanelAtom, { ...state, overwrite: action.value })
    } else {
      const patch = action.type === 'draft' ? action.patch : {
        delimiters: action.enabled ? state.draft.delimiters + action.value
          : state.draft.delimiters.split(action.value).join(''),
      }
      set(textColumnsPanelAtom, { ...state, draft: { ...state.draft, ...patch },
        preview: null, status: 'idle', overwrite: false, error: null })
    }
    return true
  }
  if (action === 'open' || action === 'preview') {
    const selection = get(selectionSnapshotAtom)
    const pending: Panel = action === 'open' ? {
      ...CLOSED, target: { connection, witness: get(selectionAuthorityWitnessAtom),
        sheetId: selection.selection.sheetId, source: { ...selection.range } },
      draft: { ...CLOSED.draft,
        destination: toA1(selection.range.rowStart, selection.range.colStart) },
      status: 'previewing',
    } : { ...state, preview: null, status: 'previewing', overwrite: false, error: null }
    set(textColumnsPanelAtom, pending)
    if (get(selectionRegionsAtom).length !== 1)
      return fail('Select one continuous column of cells.')
    const request = requestFromDraft(pending)
    if (typeof request === 'string') return fail(request)
    try {
      const response = connection.request('textColumns.preview', request)
      await Promise.resolve()
      if (get(textColumnsPanelAtom) === pending) set(textColumnsPanelAtom, pending)
      const preview = await response
      if (get(textColumnsPanelAtom) !== pending) return false
      if (get(rustWorkbookConnectionAtom) !== connection ||
        get(selectionAuthorityWitnessAtom) !== pending.target!.witness)
        return fail('The selection or workbook changed. Close this dialog and select the source again.')
      set(textColumnsPanelAtom, { ...pending, status: 'idle', preview: { ...preview, request } })
      return true
    } catch (error) {
      if (get(textColumnsPanelAtom) !== pending) return false
      return fail(error instanceof Error ? error.message : 'Could not preview this split.')
    }
  }
  if (state.status !== 'idle' || !state.preview) return fail('Update the preview before applying.')
  if (state.preview.overwrittenCells > 0 && !state.overwrite)
    return fail('Confirm overwriting the occupied destination cells before applying.')
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  if (witness.status !== 'ready' || visible?.kind !== 'visible-window' ||
    visible.sheetId !== state.target!.sheetId)
    return fail('Wait for the worksheet to finish loading.')
  const gate = set(resolveContentMutationAtom, {
    kind: 'split-text-columns', sheetId: state.target!.sheetId, range: state.preview.target,
  })
  if (gate.status === 'blocked') return fail(gate.diagnostic.message)
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return fail('Could not allocate a projection request.')
  const projection = createVisibleProjectionRequest({
    sheetId: visible.sheetId, window: visible.window, viewport: visible.viewport,
    requestId, reason: 'toolbar',
  })
  const pending: Panel = { ...state, status: 'applying', error: null }
  set(textColumnsPanelAtom, pending)
  try {
    const response = connection.request('textColumns.apply', {
      ...state.preview.request, overwrite: state.overwrite,
      expectedRevision: state.preview.revision, projection,
    })
    await Promise.resolve()
    if (get(textColumnsPanelAtom) === pending) set(textColumnsPanelAtom, pending)
    const result = await response
    if (get(textColumnsPanelAtom) !== pending) return false
    if (get(rustWorkbookConnectionAtom) !== connection) {
      set(textColumnsPanelAtom, CLOSED)
      return false
    }
    const applied = set(applyVisibleProjectionAtom, {
      witness, request: projection, result: result.projection,
    })
    if (applied.status === 'rejected') {
      set(textColumnsPanelAtom, { ...pending, status: 'idle', preview: null, overwrite: false,
        error: 'The split was applied, but the view could not be updated. Check the sheet before retrying.' })
      return false
    }
    if (applied.status === 'applied' && get(selectionAuthorityWitnessAtom) === state.target!.witness) {
      const range = result.target
      set(setSelectionAtom, { kind: 'range', sheetId: state.target!.sheetId,
        anchor: { row: range.rowStart, col: range.colStart },
        focus: { row: range.rowEnd, col: range.colEnd } })
      set(scrollToCellAtom, { coord: { row: range.rowStart, col: range.colStart } })
    }
    set(textColumnsPanelAtom, CLOSED)
    return true
  } catch (error) {
    if (get(textColumnsPanelAtom) !== pending) return false
    // 未确认的响应不可重放；新的预览会重新检查版本和覆盖范围。
    set(textColumnsPanelAtom, { ...pending, status: 'idle', preview: null, overwrite: false,
      error: error instanceof Error ? error.message : 'Could not confirm the split. Check the sheet before retrying.' })
    return false
  }
})
