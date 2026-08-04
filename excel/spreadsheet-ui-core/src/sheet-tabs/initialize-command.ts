import { atom } from '@einfach/core'
import type { Getter, Setter } from '@einfach/core'
import { normalizeSheetMetadataList } from './metadata'
import { captureSheetTabsPorts, capabilitiesFromPorts, issueSheetTabRequestId, nextSheetTabIdentity, sheetTabErrorMessage, snapshotSheetListProjection } from './ports'
import { commitFallbackActiveSheet, commitSheetProjection } from './projection'
import { DEFAULT_SHEET_TABS_STATE, sheetTabsAtom, sheetTabsPortsAtom, sheetTabsSheetStateAtom } from './state'
import type { InitializeSheetTabsInput } from './types'

export const initializeSheetTabsAtom = atom(null, async (get, set, input: InitializeSheetTabsInput): Promise<void> => {
  const previous = get(sheetTabsAtom)
  const sessionId = nextSheetTabIdentity(previous.sessionId)
  if (sessionId === null) {
    set(sheetTabsPortsAtom, {})
    set(sheetTabsAtom, { ...DEFAULT_SHEET_TABS_STATE, sessionId: previous.sessionId, phase: 'ready', error: 'Sheet-tab session identity is unavailable' })
    return
  }
  let ports
  try { ports = captureSheetTabsPorts(input.backend) } catch { ports = {} }
  const capabilities = capabilitiesFromPorts(ports)
  const seedSheets = normalizeSheetMetadataList(input.sheets)
  set(sheetTabsSheetStateAtom, { sheets: seedSheets })
  commitFallbackActiveSheet(get, set, seedSheets)
  set(sheetTabsPortsAtom, ports)
  if (!ports.listSheets) {
    set(sheetTabsAtom, { ...DEFAULT_SHEET_TABS_STATE, phase: 'ready', sessionId, capabilities, error: 'Live sheet list is unavailable; sheet changes are disabled' })
    return
  }
  const loadRequestId = issueSheetTabRequestId(get, set)
  if (loadRequestId === null) {
    set(sheetTabsAtom, { ...DEFAULT_SHEET_TABS_STATE, phase: 'ready', sessionId, capabilities, error: 'Sheet-list request identity is unavailable' })
    return
  }
  set(sheetTabsAtom, { ...DEFAULT_SHEET_TABS_STATE, phase: 'loading', sessionId, loadRequestId, capabilities })
  let result
  try { result = await ports.listSheets() } catch (error) { settleSheetListLoadError(get, set, sessionId, loadRequestId, error); return }
  const current = get(sheetTabsAtom)
  if (current.sessionId !== sessionId || current.phase !== 'loading' || current.loadRequestId !== loadRequestId) return
  const projection = snapshotSheetListProjection(result)
  if (projection === null) { settleSheetListLoadError(get, set, sessionId, loadRequestId, 'Sheet-list projection is invalid'); return }
  commitSheetProjection(get, set, projection.sheets, projection.revision, null)
  const settled = get(sheetTabsAtom)
  if (settled.sessionId === sessionId && settled.phase === 'loading' && settled.loadRequestId === loadRequestId) set(sheetTabsAtom, { ...settled, phase: 'ready', loadRequestId: null, error: null })
})

export const disposeSheetTabsAtom = atom(null, (get, set): void => {
  const previous = get(sheetTabsAtom)
  const sessionId = nextSheetTabIdentity(previous.sessionId) ?? previous.sessionId
  set(sheetTabsPortsAtom, {})
  set(sheetTabsAtom, { ...DEFAULT_SHEET_TABS_STATE, sessionId })
})

function settleSheetListLoadError(get: Getter, set: Setter, sessionId: number, loadRequestId: number, error: unknown): void {
  const state = get(sheetTabsAtom)
  if (state.sessionId !== sessionId || state.phase !== 'loading' || state.loadRequestId !== loadRequestId) return
  set(sheetTabsAtom, { ...state, phase: 'ready', loadRequestId: null, error: sheetTabErrorMessage(error, 'Sheet list failed to load') })
}

initializeSheetTabsAtom.debugLabel = 'spreadsheet.sheetTabs.initialize'
disposeSheetTabsAtom.debugLabel = 'spreadsheet.sheetTabs.dispose'
