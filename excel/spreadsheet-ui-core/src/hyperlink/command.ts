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
import { showFormulasAtom } from '../calculation/formula-view'
import type { CellCoord } from '../shared'
import type { ProjectionRevision, VisibleProjectionResult } from '../backend'

function projectedCell(result: VisibleProjectionResult, cell: CellCoord) {
  return [...result.mergeAnchors ?? [], ...result.cells,
    ...result.frozen?.regions.flatMap((region) =>
      [...region.mergeAnchors ?? [], ...region.cells]) ?? []]
    .find((candidate) => candidate.row === cell.row && candidate.col === cell.col)
}

interface Panel {
  connection: RustWorkbookConnection | null
  sheetId: string
  cell: CellCoord
  revision?: ProjectionRevision
  url: string
  text: string
  originalText: string
  existing: boolean
  busy: boolean
  error: string
}
const CLOSED: Panel = { connection: null, sheetId: '', cell: { row: 0, col: 0 },
  url: '', text: '', originalText: '', existing: false, busy: false, error: '' }
const panelAtom = atom<Panel>(CLOSED)

/** 只有弹窗草稿，不缓存每格链接；关闭/换连接后旧操作不能更新新弹窗。 */
export const hyperlinkPanelAtom = atom((get) => {
  const state = get(panelAtom)
  const sheet = get(activeWorkbookSheetAtom)
  const projection = get(projectionSnapshotAtom)
  const result = projection.result
  const current = state.connection === get(rustWorkbookConnectionAtom) &&
    state.sheetId === sheet?.id
  const ready = projection.status === 'ready' && result?.kind === 'visible-window' &&
    result.sheetId === sheet?.id && result.revision !== undefined
  const selection = get(selectionSnapshotAtom)
  const knownCell = result?.kind === 'visible-window' &&
    (isCellInRange(selection.activeCell, result.window) ||
      result.frozen?.regions.some((region) => isCellInRange(selection.activeCell, region.window)) ||
      projectedCell(result, selection.activeCell) !== undefined)
  const single = selection.range.rowStart === selection.range.rowEnd &&
    selection.range.colStart === selection.range.colEnd
  const merged = result?.kind === 'visible-window' && result.mergedRanges?.some((range) =>
    range.rowStart === selection.range.rowStart && range.rowEnd === selection.range.rowEnd &&
    range.colStart === selection.range.colStart && range.colEnd === selection.range.colEnd)
  return { ...state, open: Boolean(current && state.connection), busy: current && state.busy,
    available: Boolean(sheet && get(rustWorkbookConnectionAtom) && ready && knownCell &&
      get(selectionRegionsAtom).length === 1 && (single || merged) &&
      !get(editingSessionAtom).source && !get(rustHistoryPanelAtom).busy &&
      !get(sheetTabsAtom).mutation) }
})

/** 打开链接前从当前投影读事实；编辑/加载/切表期间不会打开旧帧地址。 */
export const readCellHyperlinkAtom = atom(null, (get, _set, cell: CellCoord): string | null => {
  const snapshot = get(projectionSnapshotAtom)
  const result = snapshot.result
  if (get(showFormulasAtom) || get(editingSessionAtom).source || snapshot.status !== 'ready' ||
    result?.kind !== 'visible-window' || result.sheetId !== get(activeWorkbookSheetAtom)?.id) return null
  return projectedCell(result, cell)?.hyperlink ?? null
})

export const runHyperlinkAtom = atom(null, async (get, set,
  action: 'open' | 'close' | 'save' | 'remove' | { url?: string; text?: string },
): Promise<boolean> => {
  const state = get(panelAtom)
  const panel = get(hyperlinkPanelAtom)
  if (panel.busy) return false
  if (action === 'close') { set(panelAtom, CLOSED); return true }
  const connection = get(rustWorkbookConnectionAtom)
  const sheet = get(activeWorkbookSheetAtom)
  if (!connection || !sheet) return false
  const witness = get(projectionSnapshotAtom)
  const result = witness.result
  const visible = witness.request
  const fail = (error: string) => {
    set(panelAtom, { ...get(panelAtom), error, busy: false })
    return false
  }
  if (action === 'open') {
    if (!panel.available || result?.kind !== 'visible-window') return false
    const cell = get(selectionSnapshotAtom).activeCell
    const source = projectedCell(result, cell)
    const text = source?.displayValue ?? ''
    set(panelAtom, { ...CLOSED, connection, sheetId: sheet.id,
      cell: { row: cell.row, col: cell.col },
      revision: result.revision, url: source?.hyperlink ?? '', existing: Boolean(source?.hyperlink),
      text, originalText: text })
    return true
  }
  if (!panel.open) return false
  if (typeof action === 'object') {
    set(panelAtom, { ...state, ...action, error: '' }); return true
  }
  if (!panel.available || visible?.kind !== 'visible-window' || result?.kind !== 'visible-window')
    return fail('Finish the current operation before changing a hyperlink.')
  if (result.revision !== state.revision)
    return fail('The workbook changed. Reopen the hyperlink editor.')
  if (action === 'remove' && !state.existing) return false
  const gate = set(resolveContentMutationAtom, {
    kind: 'change-hyperlink', sheetId: sheet.id, cell: state.cell,
  })
  if (gate.status !== 'allowed') return fail(gate.diagnostic.message)
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return false
  const projection = createVisibleProjectionRequest({ sheetId: sheet.id, requestId,
    window: visible.window, viewport: visible.viewport, reason: 'toolbar' })
  const pending = { ...state, busy: true, error: '' }
  set(panelAtom, pending)
  try {
    const request = connection.request('hyperlink.change', { sheetId: sheet.id, ...state.cell,
      url: action === 'remove' ? null : state.url.trim(),
      ...(action === 'remove' || state.text === state.originalText && state.text !== ''
        ? {} : { text: state.text || state.url.trim() }),
      revision: state.revision!, projection })
    await Promise.resolve()
    if (get(panelAtom) === pending) set(panelAtom, pending)
    const reply = await request
    if (get(rustWorkbookConnectionAtom) !== connection || get(panelAtom) !== pending) return false
    if (typeof reply.changed !== 'boolean' ||
      reply.projection.revision !== Number(state.revision) + (reply.changed ? 1 : 0) ||
      !validateProjectionResult(reply.projection, { request: projection }).ok)
      throw new Error('Rust returned a mismatched hyperlink result.')
    set(applyVisibleProjectionAtom, { witness, request: projection, result: reply.projection })
    set(panelAtom, CLOSED)
    return true
  } catch (error) {
    if (get(rustWorkbookConnectionAtom) !== connection || get(panelAtom) !== pending) return false
    return fail(error instanceof Error ? error.message : String(error))
  }
})
