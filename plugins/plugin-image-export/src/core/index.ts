import { atom } from '@einfach/core'
import {
  activeWorkbookSheetAtom, editingSessionAtom, readWorkbookDisplayRangeAtom,
  rustWorkbookConnectionAtom, selectionRegionsAtom, selectionSnapshotAtom,
  type RustWorkbookConnection, type VisibleProjectionResult,
} from '@einfach-excel/spreadsheet-ui-core'

interface ImageExportState {
  open: boolean
  busy: boolean
  sheetId: string
  connection: RustWorkbookConnection | null
  snapshot: VisibleProjectionResult | null
  scale: number
  error: string
  success: boolean
}
const CLOSED: ImageExportState = {
  open: false, busy: false, sheetId: '', connection: null, snapshot: null,
  scale: 1, error: '', success: false,
}
const stateAtom = atom<ImageExportState>(CLOSED)
stateAtom.debugLabel = 'plugin.imageExport.state'
export const imageExportPanelAtom = atom((get) => {
  const state = get(stateAtom)
  return state.connection === get(rustWorkbookConnectionAtom)
    && state.sheetId === get(activeWorkbookSheetAtom)?.id ? state : CLOSED
})
imageExportPanelAtom.debugLabel = 'plugin.imageExport.panel'

export const openImageExportAtom = atom(null, async (get, set): Promise<boolean> => {
  if (get(stateAtom).busy || get(editingSessionAtom).source) return false
  const sheet = get(activeWorkbookSheetAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (!sheet || !connection) return false
  const pending = { ...CLOSED, open: true, busy: true, sheetId: sheet.id, connection }
  set(stateAtom, pending)
  try {
    if (get(selectionRegionsAtom).length !== 1) throw new Error('Choose one continuous range.')
    const read = set(readWorkbookDisplayRangeAtom, {
      sheetId: sheet.id, range: get(selectionSnapshotAtom).range,
    })
    await Promise.resolve()
    if (get(stateAtom) === pending) set(stateAtom, pending)
    const result = await read
    if (result.status === 'error') throw new Error(result.error.message)
    const snapshot = result.snapshot
    if (get(stateAtom) !== pending || get(rustWorkbookConnectionAtom) !== connection) return false
    set(stateAtom, { ...pending, busy: false, snapshot })
    return true
  } catch (error) {
    if (get(stateAtom) === pending)
      set(stateAtom, { ...pending, busy: false,
        error: String(error instanceof Error ? error.message : error) })
    return false
  }
})
openImageExportAtom.debugLabel = 'plugin.imageExport.open'

export const configureImageExportAtom = atom(null, (get, set, action: 'close' | { scale: number }) => {
  const state = get(stateAtom)
  if (state.busy && state.snapshot) return false
  if (action === 'close') { set(stateAtom, CLOSED); return true }
  if (state.busy || ![1, 2].includes(action.scale)) return false
  set(stateAtom, { ...state, scale: action.scale, error: '', success: false })
  return true
})
configureImageExportAtom.debugLabel = 'plugin.imageExport.configure'

/** Browser output is injected by the view; selection capture and operation state stay here. */
export const deliverImageExportAtom = atom(null, async (
  get, set, write: (snapshot: VisibleProjectionResult, scale: number) => Promise<void>,
): Promise<boolean> => {
  const state = get(imageExportPanelAtom)
  if (!state.open || state.busy || !state.snapshot) return false
  const pending = { ...state, busy: true, error: '', success: false }
  set(stateAtom, pending)
  try {
    const output = write(state.snapshot, state.scale)
    await Promise.resolve()
    if (get(stateAtom) === pending) set(stateAtom, pending)
    await output
    if (get(stateAtom) !== pending) return false
    set(stateAtom, { ...state, busy: false, success: true })
    return true
  } catch (error) {
    if (get(stateAtom) === pending)
      set(stateAtom, { ...state, busy: false,
        error: String(error instanceof Error ? error.message : error) })
    return false
  }
})
deliverImageExportAtom.debugLabel = 'plugin.imageExport.deliver'
