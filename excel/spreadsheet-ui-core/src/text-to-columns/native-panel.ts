import { atom } from '@einfach/core'
import { toA1 } from '../contracts'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import { editingSessionAtom } from '../editing/session-atoms'
import {
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
} from '../projection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import {
  selectionAuthorityWitnessAtom,
  selectionRegionsAtom,
  selectionSnapshotAtom,
  setSelectionAtom,
} from '../selection'
import { scrollToCellAtom } from '../viewport/metrics'
import { MAX_TEXT_COLUMNS_FILE_BYTES, parseImportedTextFile } from './file-parse'
import { applyFileTextColumns, previewFileTextColumns } from './file-session'
import {
  applyTextColumnsDraftAction,
  CLOSED_TEXT_COLUMNS_PANEL,
  requestFromTextColumnsDraft,
  type TextColumnsDraftAction,
  type TextColumnsFileSource,
  type TextColumnsPanelState,
} from './native-panel-draft'

export type { TextColumnsFileSource }

/** 只保存表单草稿、可选导入文件行和有限样本；单元格源数据仍在 Rust。 */
export const textColumnsPanelAtom = atom<TextColumnsPanelState>(CLOSED_TEXT_COLUMNS_PANEL)
textColumnsPanelAtom.debugLabel = 'spreadsheet.textToColumns.panel'

export type TextColumnsPanelAction =
  | 'open'
  | 'close'
  | 'preview'
  | 'apply'
  | 'clearFile'
  | TextColumnsDraftAction
  | { type: 'importFile'; name: string; size: number; read: () => Promise<string> }

/** 同一入口处理草稿、文件导入、只读预览和原子应用；旧响应不能复活关闭的面板。 */
export const runTextColumnsPanelAtom = atom(
  null,
  async (get, set, action: TextColumnsPanelAction) => {
    const state = get(textColumnsPanelAtom)
    if (state.status === 'applying') return false
    if (action === 'close') {
      set(textColumnsPanelAtom, CLOSED_TEXT_COLUMNS_PANEL)
      return true
    }
    const connection = get(rustWorkbookConnectionAtom)
    const fail = (error: string, clearPreview = false) => {
      const prev = get(textColumnsPanelAtom)
      set(textColumnsPanelAtom, {
        ...prev,
        ...(clearPreview ? { preview: null, overwrite: false } : {}),
        status: 'idle',
        error,
      })
      return false
    }
    if (action !== 'open') {
      if (!state.target) return false
      if (
        state.target.connection !== connection ||
        state.target.witness !== get(selectionAuthorityWitnessAtom)
      )
        return fail('The selection or workbook changed. Close this dialog and select the source again.')
    }
    if (!connection || get(editingSessionAtom).source) return false
    if (action === 'clearFile') {
      set(textColumnsPanelAtom, {
        ...state,
        file: null,
        preview: null,
        status: 'idle',
        overwrite: false,
        error: null,
      })
      return true
    }
    if (typeof action === 'object' && action.type !== 'importFile') {
      const result = applyTextColumnsDraftAction(state, action)
      if (!result.ok) return result.error ? fail(result.error) : false
      set(textColumnsPanelAtom, result.next)
      return true
    }
    if (
      action === 'open' ||
      action === 'preview' ||
      (typeof action === 'object' && action.type === 'importFile')
    ) {
      let baseState = state
      if (typeof action === 'object' && action.type === 'importFile') {
        if (action.size > MAX_TEXT_COLUMNS_FILE_BYTES)
          return fail('File exceeds the 16 MiB limit. Choose a smaller file.', true)
        if (action.size === 0) return fail('The selected file is empty.', true)
        let rawText: string
        try {
          rawText = await action.read()
        } catch (error) {
          return fail(
            error instanceof Error ? error.message : 'Could not read the selected file.',
            true,
          )
        }
        if (get(textColumnsPanelAtom) !== state) return false
        const parsed = parseImportedTextFile(action.name, action.size, rawText)
        if (typeof parsed === 'string') return fail(parsed, true)
        baseState = {
          ...state,
          file: { name: parsed.name, lines: parsed.lines },
          draft: {
            ...state.draft,
            kind: 'delimited',
            delimiters: parsed.defaultDelimiters,
            otherDelimiter: '',
            mergeConsecutive: false,
            qualifier: '"',
            columnTypes: [],
          },
        }
      }
      const selection = get(selectionSnapshotAtom)
      const pending: TextColumnsPanelState =
        action === 'open'
          ? {
              ...CLOSED_TEXT_COLUMNS_PANEL,
              target: {
                connection,
                witness: get(selectionAuthorityWitnessAtom),
                sheetId: selection.selection.sheetId,
                source: { ...selection.range },
              },
              draft: {
                ...CLOSED_TEXT_COLUMNS_PANEL.draft,
                destination: toA1(selection.range.rowStart, selection.range.colStart),
              },
              status: 'previewing',
            }
          : { ...baseState, preview: null, status: 'previewing', overwrite: false, error: null }
      set(textColumnsPanelAtom, pending)
      if (!pending.file && get(selectionRegionsAtom).length !== 1)
        return fail('Select one continuous column of cells.')
      const request = requestFromTextColumnsDraft(pending)
      if (typeof request === 'string') return fail(request)
      try {
        if (pending.file) {
          const preview = await previewFileTextColumns(
            get,
            set,
            connection,
            pending.file.lines,
            request,
          )
          if (get(textColumnsPanelAtom) !== pending) return false
          if (
            get(rustWorkbookConnectionAtom) !== connection ||
            get(selectionAuthorityWitnessAtom) !== pending.target!.witness
          )
            return fail('The selection or workbook changed. Close this dialog and select the source again.')
          if (typeof preview === 'string') return fail(preview)
          set(textColumnsPanelAtom, { ...pending, status: 'idle', preview: { ...preview, request } })
          return true
        }
        const response = connection.request('textColumns.preview', request)
        await Promise.resolve()
        if (get(textColumnsPanelAtom) === pending) set(textColumnsPanelAtom, pending)
        const preview = await response
        if (get(textColumnsPanelAtom) !== pending) return false
        if (
          get(rustWorkbookConnectionAtom) !== connection ||
          get(selectionAuthorityWitnessAtom) !== pending.target!.witness
        )
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
    const gate = set(resolveContentMutationAtom, {
      kind: 'split-text-columns',
      sheetId: state.target!.sheetId,
      range: state.preview.target,
    })
    if (gate.status === 'blocked') return fail(gate.diagnostic.message)
    if (state.file && state.preview.tsv !== undefined) {
      const pending: TextColumnsPanelState = { ...state, status: 'applying', error: null }
      set(textColumnsPanelAtom, pending)
      const outcome = await applyFileTextColumns({
        get,
        set,
        connection,
        sheetId: state.target!.sheetId,
        target: state.preview.target,
        tsv: state.preview.tsv,
        expectedRevision: state.preview.revision,
      })
      if (get(textColumnsPanelAtom) !== pending) return false
      if (get(rustWorkbookConnectionAtom) !== connection) {
        set(textColumnsPanelAtom, CLOSED_TEXT_COLUMNS_PANEL)
        return false
      }
      if (!outcome.ok) {
        set(textColumnsPanelAtom, {
          ...pending,
          status: 'idle',
          preview: null,
          overwrite: false,
          error: outcome.error,
        })
        return false
      }
      set(textColumnsPanelAtom, CLOSED_TEXT_COLUMNS_PANEL)
      return true
    }
    const witness = get(projectionSnapshotAtom)
    const visible = witness.request
    if (
      witness.status !== 'ready' ||
      visible?.kind !== 'visible-window' ||
      visible.sheetId !== state.target!.sheetId
    )
      return fail('Wait for the worksheet to finish loading.')
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) return fail('Could not allocate a projection request.')
    const projection = createVisibleProjectionRequest({
      sheetId: visible.sheetId,
      window: visible.window,
      viewport: visible.viewport,
      requestId,
      reason: 'toolbar',
    })
    const pending: TextColumnsPanelState = { ...state, status: 'applying', error: null }
    set(textColumnsPanelAtom, pending)
    try {
      const response = connection.request('textColumns.apply', {
        ...state.preview.request,
        overwrite: state.overwrite,
        expectedRevision: state.preview.revision,
        projection,
      })
      await Promise.resolve()
      if (get(textColumnsPanelAtom) === pending) set(textColumnsPanelAtom, pending)
      const result = await response
      if (get(textColumnsPanelAtom) !== pending) return false
      if (get(rustWorkbookConnectionAtom) !== connection) {
        set(textColumnsPanelAtom, CLOSED_TEXT_COLUMNS_PANEL)
        return false
      }
      const applied = set(applyVisibleProjectionAtom, {
        witness,
        request: projection,
        result: result.projection,
      })
      if (applied.status === 'rejected') {
        set(textColumnsPanelAtom, {
          ...pending,
          status: 'idle',
          preview: null,
          overwrite: false,
          error: 'The split was applied, but the view could not be updated. Check the sheet before retrying.',
        })
        return false
      }
      if (applied.status === 'applied' && get(selectionAuthorityWitnessAtom) === state.target!.witness) {
        const range = result.target
        set(setSelectionAtom, {
          kind: 'range',
          sheetId: state.target!.sheetId,
          anchor: { row: range.rowStart, col: range.colStart },
          focus: { row: range.rowEnd, col: range.colEnd },
        })
        set(scrollToCellAtom, { coord: { row: range.rowStart, col: range.colStart } })
      }
      set(textColumnsPanelAtom, CLOSED_TEXT_COLUMNS_PANEL)
      return true
    } catch (error) {
      if (get(textColumnsPanelAtom) !== pending) return false
      set(textColumnsPanelAtom, {
        ...pending,
        status: 'idle',
        preview: null,
        overwrite: false,
        error: error instanceof Error ? error.message : 'Could not confirm the split. Check the sheet before retrying.',
      })
      return false
    }
  },
)
runTextColumnsPanelAtom.debugLabel = 'spreadsheet.textToColumns.runPanel'
