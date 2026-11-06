import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import { editingSessionAtom } from '../editing/session-atoms'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import { selectionRegionsAtom, selectionSnapshotAtom } from '../selection'
import {
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
} from '../projection'
import { isProjectionCommandReady } from '../projection/command-ready'
import { activeCellFactAtom } from '../projection/active-cell-fact'
import { validateProjectionResult } from '../projection/contracts'
import type { CellCoord } from '../shared'
import type {
  ProjectionRevision,
  RichTextRun,
  RichTextFormat,
  SpreadsheetCellFormat,
} from '../contracts'
import { formatRichTextDraft, replaceRichTextDraft, richTextSelection } from './draft'

interface Panel {
  connection: RustWorkbookConnection | null
  sheetId: string
  cell: CellCoord
  revision?: ProjectionRevision
  runs: readonly RichTextRun[]
  start: number
  end: number
  base?: SpreadsheetCellFormat
  busy: boolean
  error: string
}
const CLOSED: Panel = {
  connection: null,
  sheetId: '',
  cell: { row: 0, col: 0 },
  runs: [],
  start: 0,
  end: 0,
  busy: false,
  error: '',
}
const panelAtom = atom<Panel>(CLOSED)
export const richTextPanelAtom = atom((get) => {
  const state = get(panelAtom),
    sheet = get(activeWorkbookSheetAtom),
    result = get(projectionSnapshotAtom).result
  const selection = get(selectionSnapshotAtom),
    source = get(activeCellFactAtom)
  const single =
    selection.range.rowStart === selection.range.rowEnd &&
    selection.range.colStart === selection.range.colEnd
  const merged =
    result?.kind === 'visible-window' &&
    result.mergedRanges?.some(
      (range) =>
        range.rowStart === selection.range.rowStart &&
        range.rowEnd === selection.range.rowEnd &&
        range.colStart === selection.range.colStart &&
        range.colEnd === selection.range.colEnd,
    )
  const current =
    state.connection === get(rustWorkbookConnectionAtom) && state.sheetId === sheet?.id
  let offset = 0
  const selected =
    state.runs.find((run) => {
      offset += run.text.length
      return offset > state.start
    })?.format ?? {}
  const text = state.runs.map((run) => run.text).join('')
  return {
    ...state,
    text,
    selected,
    open: Boolean(current && state.connection),
    available: Boolean(
      sheet &&
        isProjectionCommandReady(get) &&
        source !== undefined &&
        !source?.formula &&
        (!source || source.valueKind === 'string' || source.valueKind === 'blank') &&
        get(selectionRegionsAtom).length === 1 &&
        (single || merged) &&
        !get(editingSessionAtom).source,
    ),
  }
})

export type RichTextAction =
  | 'open'
  | 'close'
  | 'save'
  | { text: string; start: number; end: number }
  | { selection: readonly [number, number] }
  | { format: RichTextFormat | null }

export const runRichTextAtom = atom(
  null,
  async (get, set, action: RichTextAction): Promise<boolean> => {
    const state = get(panelAtom),
      panel = get(richTextPanelAtom)
    if (state.busy) return false
    if (action === 'close') {
      set(panelAtom, CLOSED)
      return true
    }
    const connection = get(rustWorkbookConnectionAtom),
      sheet = get(activeWorkbookSheetAtom)
    const witness = get(projectionSnapshotAtom),
      result = witness.result,
      visible = witness.request
    if (!connection || !sheet) return false
    const fail = (error: string) => {
      set(panelAtom, { ...get(panelAtom), error, busy: false })
      return false
    }
    if (action === 'open') {
      if (!panel.available || result?.kind !== 'visible-window') return false
      const source = get(activeCellFactAtom),
        cell = get(selectionSnapshotAtom).activeCell
    const text = source?.displayValue ?? ''
      set(panelAtom, {
        ...CLOSED,
        connection,
        sheetId: sheet.id,
        cell: { row: cell.row, col: cell.col },
        revision: result.revision,
        base: source?.format,
        runs:
          source?.richText?.map((run) => ({ text: run.text, format: { ...run.format } })) ??
          (text ? [{ text, format: {} }] : []),
      })
      return true
    }
    if (!panel.open) return false
    if (typeof action === 'object') {
      if ('selection' in action) {
        const [start, end] = richTextSelection(panel.text, ...action.selection)
        set(panelAtom, { ...state, start, end })
      } else if ('text' in action) {
        if (Array.from(action.text).length > 32767 || action.text.includes('\0'))
          return fail('Rich text exceeds the cell size limit.')
        const [start, end] = richTextSelection(action.text, action.start, action.end)
        set(panelAtom, {
          ...state,
          runs: replaceRichTextDraft(state.runs, action.text),
          start,
          end,
          error: '',
        })
      } else {
        const runs = formatRichTextDraft(state.runs, state.start, state.end, action.format)
        if (runs.length > 1024) return fail('Rich text exceeds the cell size limit.')
        set(panelAtom, { ...state, runs, error: '' })
      }
      return true
    }
    if (
      !isProjectionCommandReady(get) ||
      visible?.kind !== 'visible-window' ||
      result?.kind !== 'visible-window'
    )
      return fail('Finish the current operation before editing rich text.')
    if (result.revision !== state.revision)
      return fail('The workbook changed. Reopen the rich text editor.')
    const gate = set(resolveContentMutationAtom, {
      kind: 'change-rich-text',
      sheetId: sheet.id,
      cell: state.cell,
    })
    if (gate.status !== 'allowed') return fail(gate.diagnostic.message)
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) return false
    const projection = createVisibleProjectionRequest({
      sheetId: sheet.id,
      requestId,
      window: visible.window,
      viewport: visible.viewport,
      reason: 'toolbar',
    })
    const pending = { ...state, busy: true, error: '' }
    set(panelAtom, pending)
    try {
      const reply = await connection.request('richText.change', {
        sheetId: sheet.id,
        ...state.cell,
        runs: state.runs,
        revision: state.revision!,
        projection,
      })
      if (get(rustWorkbookConnectionAtom) !== connection || get(panelAtom) !== pending) return false
      if (
        typeof reply.changed !== 'boolean' ||
        reply.projection.revision !== Number(state.revision) + (reply.changed ? 1 : 0) ||
        !validateProjectionResult(reply.projection, { request: projection }).ok
      )
        throw new Error('Rust returned a mismatched rich text result.')
      set(applyVisibleProjectionAtom, { witness, request: projection, result: reply.projection })
      set(panelAtom, CLOSED)
      return true
    } catch (error) {
      if (get(rustWorkbookConnectionAtom) !== connection || get(panelAtom) !== pending) return false
      return fail(error instanceof Error ? error.message : String(error))
    }
  },
)
richTextPanelAtom.debugLabel = 'spreadsheet.richText.panel'
runRichTextAtom.debugLabel = 'spreadsheet.richText.command'
