import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import { editingSessionAtom } from '../editing/session-atoms'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { applyVisibleProjectionAtom, createVisibleProjectionRequest,
  issueProjectionRequestIdAtom, projectionSnapshotAtom } from '../projection'
import { validateProjectionResult } from '../projection/contracts'
import type { ProjectionRevision } from '../backend'
import { hydrateCustomFormulaDefinitionsAtom, nativeCustomFormulaDefinitionsAtom } from './expression-catalog'
import { validateCustomFormulaDefinitions, type NativeCustomFormulaAction } from './expression-types'

interface Panel {
  connection: RustWorkbookConnection | null
  sheetId: string
  revision?: ProjectionRevision
  selected: string
  name: string
  parameters: string
  expression: string
  loaded: boolean
  phase: 'reading' | 'saving' | null
  error: string
}
const CLOSED: Panel = { connection: null, sheetId: '', selected: '', name: '', parameters: '',
  expression: '', loaded: false, phase: null, error: '' }
const panelAtom = atom<Panel>(CLOSED)
type DraftChange = Partial<Pick<Panel, 'name' | 'parameters' | 'expression'>>
export type CustomFormulaPanelAction = 'open' | 'close' | 'save' | 'remove' | 'new' |
  { select: string } | { draft: DraftChange }

export const customFormulaPanelAtom = atom(get => {
  const state = get(panelAtom)
  const sheet = get(activeWorkbookSheetAtom)
  const connection = get(rustWorkbookConnectionAtom)
  const projection = get(projectionSnapshotAtom)
  const current = state.connection === connection && state.sheetId === sheet?.id
  return { ...state, open: Boolean(current && connection), busy: Boolean(current && state.phase),
    definitions: get(nativeCustomFormulaDefinitionsAtom),
    available: Boolean(connection && sheet && projection.status === 'ready' &&
      projection.result?.kind === 'visible-window' && projection.result.sheetId === sheet.id &&
      projection.result.revision !== undefined && !get(editingSessionAtom).source &&
      !get(rustHistoryPanelAtom).busy && !get(sheetTabsAtom).mutation) }
})

/** Only the current editor draft lives here; committed definitions come from Rust. */
export const runCustomFormulaAtom = atom(null, async (get, set,
  action: CustomFormulaPanelAction): Promise<boolean> => {
  const state = get(panelAtom)
  const panel = get(customFormulaPanelAtom)
  if (action === 'close') {
    if (panel.phase === 'saving') return false
    set(panelAtom, CLOSED); return true
  }
  if (panel.busy) return false
  const connection = get(rustWorkbookConnectionAtom)
  const sheet = get(activeWorkbookSheetAtom)
  if (!connection || !sheet) return false
  const witness = get(projectionSnapshotAtom)
  const result = witness.result
  const visible = witness.request
  const fail = (error: unknown) => {
    set(panelAtom, { ...get(panelAtom), phase: null,
      error: error instanceof Error ? error.message : String(error) }); return false
  }
  if (action === 'open') {
    if (!panel.available || result?.kind !== 'visible-window') return false
    const pending: Panel = { ...CLOSED, connection, sheetId: sheet.id,
      revision: result.revision, phase: 'reading' }
    set(panelAtom, pending)
    try {
      const request = connection.request('customFormula.read', { revision: result.revision! })
      // Publish after the synchronous async-atom batch so slow reads render busy.
      await Promise.resolve()
      if (get(panelAtom) === pending) set(panelAtom, pending)
      const reply = await request
      if (get(panelAtom) !== pending || get(rustWorkbookConnectionAtom) !== connection ||
        get(activeWorkbookSheetAtom)?.id !== sheet.id) return false
      if (
        reply.revision !== result.revision ||
        get(projectionSnapshotAtom).result?.revision !== result.revision
      )
        throw new Error('The workbook changed. Reopen the custom formula editor.')
      set(hydrateCustomFormulaDefinitionsAtom, { connection,
        definitions: validateCustomFormulaDefinitions(reply.definitions) })
      set(panelAtom, { ...pending, loaded: true, phase: null }); return true
    } catch (error) {
      if (get(panelAtom) !== pending || get(rustWorkbookConnectionAtom) !== connection) return false
      return fail(error)
    }
  }
  if (!panel.open || !state.loaded) return false
  if (action === 'new') {
    set(panelAtom, { ...state, selected: '', name: '', parameters: '', expression: '', error: '' }); return true
  }
  if (typeof action === 'object') {
    if ('draft' in action) {
      set(panelAtom, { ...state, ...action.draft, error: '' }); return true
    }
    const definition = panel.definitions.find(item => item.name === action.select)
    if (!definition) return false
    set(panelAtom, { ...state, selected: definition.name, name: definition.name,
      parameters: definition.parameters.join(', '), expression: definition.expression, error: '' }); return true
  }
  if (!panel.available || visible?.kind !== 'visible-window' || result?.kind !== 'visible-window')
    return fail('Finish the current operation before changing a custom formula.')
  if (result.revision !== state.revision)
    return fail('The workbook changed. Reopen the custom formula editor.')
  if (action === 'remove' && !state.selected) return false
  if (action === 'save' && (!state.name.trim() || !state.expression.trim()))
    return fail('Enter a custom formula name and expression.')
  const change: NativeCustomFormulaAction = action === 'remove' ? { kind: 'remove', name: state.selected } :
    { kind: 'upsert', definition: { name: state.name, expression: state.expression,
      parameters: state.parameters.trim() ? state.parameters.split(',').map(value => value.trim()) : [] } }
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return false
  const projection = createVisibleProjectionRequest({ sheetId: sheet.id, requestId,
    window: visible.window, viewport: visible.viewport, reason: 'toolbar' })
  const pending: Panel = { ...state, phase: 'saving', error: '' }
  set(panelAtom, pending)
  try {
    const request = connection.request('customFormula.change', { sheetId: sheet.id,
      revision: state.revision!, action: change, projection })
    await Promise.resolve()
    if (get(panelAtom) === pending) set(panelAtom, pending)
    const reply = await request
    if (get(panelAtom) !== pending || get(rustWorkbookConnectionAtom) !== connection) return false
    const definitions = validateCustomFormulaDefinitions(reply.definitions)
    if (typeof reply.changed !== 'boolean' ||
      reply.projection.revision !== Number(state.revision) + (reply.changed ? 1 : 0) ||
      !validateProjectionResult(reply.projection, { request: projection }).ok)
      throw new Error('Rust returned a mismatched custom formula result.')
    set(applyVisibleProjectionAtom, { witness, request: projection, result: reply.projection })
    set(hydrateCustomFormulaDefinitionsAtom, { connection, definitions })
    set(panelAtom, CLOSED); return true
  } catch (error) {
    if (get(panelAtom) !== pending || get(rustWorkbookConnectionAtom) !== connection) return false
    return fail(error)
  }
})
