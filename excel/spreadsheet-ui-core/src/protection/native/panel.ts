import { atom } from '@einfach/core'
import type { ProjectionRevision } from '../../backend'
import type { CellRange } from '../../shared'
import type { RustWorkbookConnection } from '../../rust-workbook/commands'
import type { NativeProtectionChange } from '../../rust-workbook/protection/commands'
import { validNativeProtection } from '../../rust-workbook/protection/commands'
import { activeWorkbookSheetAtom } from '../../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../../runtime/workbook-connection'
import { editingSessionAtom } from '../../editing/session-atoms'
import { rustHistoryPanelAtom } from '../../history/rust-history-command'
import { sheetTabsAtom } from '../../sheet-tabs/state'
import { selectionRegionsAtom, selectionSnapshotAtom } from '../../selection'
import { rangeToA1 } from '../../name-box/address'
import { applyVisibleProjectionAtom, createVisibleProjectionRequest,
  issueProjectionRequestIdAtom, projectionSnapshotAtom } from '../../projection'
import { validateProjectionResult } from '../../projection/contracts'
import { setSheetProtectionAtom } from '../index'
import type { SheetProtectionState } from '../types'

interface Panel {
  sheetId: string | null
  connection: RustWorkbookConnection | null
  phase: 'closed' | 'reading' | 'ready' | 'saving'
  protection: SheetProtectionState | null
  selection: CellRange | null
  revision?: ProjectionRevision
  error: string
}
const CLOSED: Panel = { sheetId: null, connection: null, phase: 'closed',
  protection: null, selection: null, error: '' }
const panelAtom = atom<Panel>(CLOSED)

export const nativeProtectionOpenAtom = atom((get) => {
  const state = get(panelAtom)
  return state.phase !== 'closed' && state.sheetId === get(activeWorkbookSheetAtom)?.id &&
    state.connection === get(rustWorkbookConnectionAtom)
})

/** Native facts are held only for the open panel; the canvas consumes returned projections. */
export const nativeProtectionPanelAtom = atom((get) => {
  const state = get(panelAtom)
  const sheet = get(activeWorkbookSheetAtom)
  const projection = get(projectionSnapshotAtom)
  const open = get(nativeProtectionOpenAtom)
  return { ...state, open, sheetName: sheet?.name ?? '',
    selectionAddress: state.selection ? rangeToA1(state.selection) : '',
    available: Boolean(sheet && get(rustWorkbookConnectionAtom) &&
      !get(editingSessionAtom).source && !get(rustHistoryPanelAtom).busy &&
      !get(sheetTabsAtom).mutation && projection.status === 'ready' &&
      projection.result?.kind === 'visible-window' && projection.result.sheetId === sheet.id),
    busy: open && ['reading', 'saving'].includes(state.phase) }
})

export const runNativeProtectionAtom = atom(null, async (get, set,
  action: 'open' | 'close' | 'protect' | 'unprotect' | 'allow-selection' | { remove: number },
): Promise<boolean> => {
  const state = get(panelAtom)
  if (action === 'close') {
    if (state.phase === 'saving') return false
    set(panelAtom, CLOSED)
    return true
  }
  const sheet = get(activeWorkbookSheetAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (!sheet || !connection) return false
  const current = () => get(activeWorkbookSheetAtom)?.id === sheet.id &&
    get(rustWorkbookConnectionAtom) === connection
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  const result = witness.result
  if (witness.status !== 'ready' || visible?.kind !== 'visible-window' ||
    visible.sheetId !== sheet.id || result?.kind !== 'visible-window' ||
    result.sheetId !== sheet.id || result.revision === undefined) return false
  if (get(editingSessionAtom).source || get(rustHistoryPanelAtom).busy ||
    get(sheetTabsAtom).mutation) return false
  if (action === 'open') {
    if (get(nativeProtectionPanelAtom).busy) return false
    const selection = get(selectionSnapshotAtom)
    const reading: Panel = { ...CLOSED, sheetId: sheet.id, connection, phase: 'reading',
      revision: result.revision,
      selection: get(selectionRegionsAtom).length === 1 ? { ...selection.range } : null }
    set(panelAtom, reading)
    try {
      const request = connection.request('protection.read', { sheetId: sheet.id })
      await Promise.resolve()
      if (get(panelAtom) === reading) set(panelAtom, reading)
      const protection = await request
      if (!current() || get(panelAtom) !== reading) return false
      if (!validNativeProtection(protection)) throw new Error('Rust returned invalid worksheet protection.')
      set(setSheetProtectionAtom, { sheetId: sheet.id, state: protection })
      set(panelAtom, { ...reading, phase: 'ready', protection })
      return true
    } catch (error) {
      if (current() && get(panelAtom) === reading)
        set(panelAtom, { ...reading, phase: 'ready', error: message(error) })
      return false
    }
  }
  if (state.sheetId !== sheet.id || state.connection !== connection ||
    state.phase !== 'ready' || !state.protection) return false
  const fail = (error: string) => { set(panelAtom, { ...state, error }); return false }
  if (state.revision !== result.revision)
    return fail('The workbook changed. Reopen worksheet protection.')
  let change: NativeProtectionChange
  if (typeof action === 'object') change = { action: 'remove-range', index: action.remove }
  else if (action === 'allow-selection') {
    if (!state.selection) return fail('Select one rectangular range to allow editing.')
    change = { action: 'allow-range', range: state.selection }
  } else change = { action }
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return false
  const projection = createVisibleProjectionRequest({ sheetId: sheet.id, requestId,
    window: visible.window, viewport: visible.viewport, reason: 'toolbar' })
  const saving: Panel = { ...state, phase: 'saving', error: '' }
  set(panelAtom, saving)
  try {
    const request = connection.request('protection.change', {
      sheetId: sheet.id, change, revision: result.revision, projection,
    })
    await Promise.resolve()
    if (get(panelAtom) === saving) set(panelAtom, saving)
    const reply = await request
    if (!current() || get(panelAtom) !== saving) return false
    if (!validNativeProtection(reply.protection) ||
      !validateProjectionResult(reply.projection, { request: projection }).ok ||
      reply.projection.revision !== Number(result.revision) + Number(reply.changed))
      throw new Error('Rust returned a mismatched protection result.')
    const applied = set(applyVisibleProjectionAtom, {
      witness,
      request: projection,
      result: reply.projection,
    })
    if (applied.status !== 'applied') throw new Error('The view changed. Reopen worksheet protection.')
    set(setSheetProtectionAtom, { sheetId: sheet.id, state: reply.protection })
    set(panelAtom, { ...state, phase: 'ready', protection: reply.protection,
      revision: reply.projection.revision, error: '' })
    return true
  } catch (error) {
    if (current() && get(panelAtom) === saving)
      set(panelAtom, { ...state, phase: 'ready', error: message(error) })
    return false
  }
})

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
