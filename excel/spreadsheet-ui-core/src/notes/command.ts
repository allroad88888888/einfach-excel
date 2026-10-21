import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import { editingSessionAtom } from '../editing/session-atoms'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import { selectionRegionsAtom, selectionSnapshotAtom } from '../selection'
import { applyVisibleProjectionAtom, createVisibleProjectionRequest,
  issueProjectionRequestIdAtom, projectionSnapshotAtom } from '../projection'
import { isCellInRange, validateProjectionResult } from '../projection/contracts'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { sheetTabsAtom } from '../sheet-tabs/state'
import type { CellCoord } from '../shared'
import type { ProjectionRevision } from '../backend'
import { validateNoteText } from './text'

interface Panel {
  connection: RustWorkbookConnection | null
  sheetId: string
  cell: CellCoord
  revision?: ProjectionRevision
  text: string
  existing: boolean
  loaded: boolean
  phase: 'loading' | 'saving' | null
  error: string
}
const CLOSED: Panel = { connection: null, sheetId: '', cell: { row: 0, col: 0 }, text: '',
  existing: false, loaded: false, phase: null, error: '' }
const panelAtom = atom<Panel>(CLOSED)

/** 仅持有当前对话框草稿；正文事实每次打开均向 Rust 读取。 */
export const notePanelAtom = atom((get) => {
  const state = get(panelAtom)
  const sheet = get(activeWorkbookSheetAtom)
  const connection = get(rustWorkbookConnectionAtom)
  const projection = get(projectionSnapshotAtom)
  const result = projection.result
  const selection = get(selectionSnapshotAtom)
  const current = state.connection === connection && state.sheetId === sheet?.id
  const ready =
    projection.status === 'ready' &&
    result?.kind === 'visible-window' &&
    result.sheetId === sheet?.id &&
    result.revision !== undefined
  const known =
    result?.kind === 'visible-window' &&
    (isCellInRange(selection.activeCell, result.window) ||
      result.frozen?.regions.some((region) => isCellInRange(selection.activeCell, region.window)))
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
  return {
    ...state,
    open: Boolean(current && connection),
    busy: Boolean(current && state.phase),
    available: Boolean(
      sheet &&
        connection &&
        ready &&
        known &&
        get(selectionRegionsAtom).length === 1 &&
        (single || merged) &&
        !get(editingSessionAtom).source &&
        !get(rustHistoryPanelAtom).busy &&
        !get(sheetTabsAtom).mutation,
    ),
  }
})

export const runNoteAtom = atom(
  null,
  async (
    get,
    set,
    action: 'open' | 'close' | 'save' | 'remove' | { text: string },
  ): Promise<boolean> => {
    const state = get(panelAtom)
    const panel = get(notePanelAtom)
    if (action === 'close') {
      if (panel.phase === 'saving') return false
      set(panelAtom, CLOSED)
      return true
    }
    if (panel.busy) return false
    const connection = get(rustWorkbookConnectionAtom)
    const sheet = get(activeWorkbookSheetAtom)
    if (!connection || !sheet) return false
    const witness = get(projectionSnapshotAtom)
    const result = witness.result
    const visible = witness.request
    const fail = (error: string) => {
      set(panelAtom, { ...get(panelAtom), error, phase: null })
      return false
    }
    if (action === 'open') {
      if (!panel.available || result?.kind !== 'visible-window') return false
      const cell = get(selectionSnapshotAtom).activeCell
      const pending: Panel = {
        ...CLOSED,
        connection,
        sheetId: sheet.id,
        cell: { ...cell },
        revision: result.revision,
        phase: 'loading',
      }
      set(panelAtom, pending)
      try {
        const request = connection.request('notes.read', {
          ...cell,
          sheetId: sheet.id,
          revision: result.revision!,
        })
        // async command 的同步批次结束后发布 loading，慢 Worker 也能立即取消。
        await Promise.resolve()
        if (get(panelAtom) === pending) set(panelAtom, pending)
        const reply = await request
        if (
          get(panelAtom) !== pending ||
          get(rustWorkbookConnectionAtom) !== connection ||
          get(activeWorkbookSheetAtom)?.id !== sheet.id
        )
          return false
        if (
          reply.revision !== result.revision ||
          get(projectionSnapshotAtom).result?.revision !== result.revision ||
          !(reply.text === null || typeof reply.text === 'string')
        )
          throw new Error('The workbook changed. Reopen the note editor.')
        set(panelAtom, {
          ...pending,
          text: reply.text ?? '',
          existing: reply.text !== null,
          loaded: true,
          phase: null,
        })
        return true
      } catch (error) {
        if (get(panelAtom) !== pending || get(rustWorkbookConnectionAtom) !== connection)
          return false
        return fail(error instanceof Error ? error.message : String(error))
      }
    }
    if (!panel.open) return false
    if (typeof action === 'object') {
      if (!state.loaded) return false
      set(panelAtom, { ...state, text: action.text, error: '' })
      return true
    }
    if (
      !state.loaded ||
      !panel.available ||
      visible?.kind !== 'visible-window' ||
      result?.kind !== 'visible-window'
    )
      return fail('Finish the current operation before changing a note.')
    if (result.revision !== state.revision)
      return fail('The workbook changed. Reopen the note editor.')
    if (action === 'remove' && !state.existing) return false
    const validated = validateNoteText(state.text)
    if (action === 'save' && validated.error) return fail(validated.error)
    const gate = set(resolveContentMutationAtom, {
      kind: 'change-note',
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
    const pending: Panel = { ...state, phase: 'saving', error: '' }
    set(panelAtom, pending)
    try {
      const request = connection.request('notes.change', {
        sheetId: sheet.id,
        ...state.cell,
        text: action === 'remove' ? null : validated.text,
        revision: state.revision!,
        projection,
      })
      await Promise.resolve()
      if (get(panelAtom) === pending) set(panelAtom, pending)
      const reply = await request
      if (get(panelAtom) !== pending || get(rustWorkbookConnectionAtom) !== connection) return false
      if (
        typeof reply.changed !== 'boolean' ||
        reply.projection.revision !== Number(state.revision) + (reply.changed ? 1 : 0) ||
        !validateProjectionResult(reply.projection, { request: projection }).ok
      )
        throw new Error('Rust returned a mismatched note result.')
      set(applyVisibleProjectionAtom, { witness, request: projection, result: reply.projection })
      set(panelAtom, CLOSED)
      return true
    } catch (error) {
      if (get(panelAtom) !== pending || get(rustWorkbookConnectionAtom) !== connection) return false
      return fail(error instanceof Error ? error.message : String(error))
    }
  },
)
