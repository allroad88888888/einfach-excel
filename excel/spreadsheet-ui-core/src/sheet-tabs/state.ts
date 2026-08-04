import { atom } from '@einfach/core'
import type { CapturedSheetTabsPorts, SheetTabsCapabilities, SheetTabsSheetState, SheetTabsState } from './types'

const NO_SHEET_TAB_CAPABILITIES: SheetTabsCapabilities = Object.freeze({ list: false, add: false, rename: false, delete: false, reorder: false })
export const DEFAULT_SHEET_TABS_STATE: SheetTabsState = { phase: 'unloaded', sessionId: 0, loadRequestId: null, capabilities: NO_SHEET_TAB_CAPABILITIES, mutation: null, lastMutation: null, error: null, contextMenu: null, rename: null, reorder: null, deleteConfirmation: null, lastIntent: null }
export const DEFAULT_SHEET_TABS_SHEET_STATE: SheetTabsSheetState = { sheets: [], revision: undefined }
export const sheetTabsAtom = atom<SheetTabsState>(DEFAULT_SHEET_TABS_STATE)
export const sheetTabsPortsAtom = atom<CapturedSheetTabsPorts>({})
export const sheetTabsRequestSequenceAtom = atom(0)
export const sheetTabsSheetStateAtom = atom<SheetTabsSheetState>(DEFAULT_SHEET_TABS_SHEET_STATE)
export const sheetTabsSheetsAtom = atom((get) => get(sheetTabsSheetStateAtom).sheets)
export const sheetTabsMutationPendingAtom = atom((get) => get(sheetTabsAtom).mutation !== null)
sheetTabsAtom.debugLabel = 'spreadsheet.sheetTabs.state'
sheetTabsPortsAtom.debugLabel = 'spreadsheet.sheetTabs.ports'
sheetTabsRequestSequenceAtom.debugLabel = 'spreadsheet.sheetTabs.requestSequence'
sheetTabsSheetStateAtom.debugLabel = 'spreadsheet.sheetTabs.sheets'
sheetTabsSheetsAtom.debugLabel = 'spreadsheet.sheetTabs.sheetList'
sheetTabsMutationPendingAtom.debugLabel = 'spreadsheet.sheetTabs.mutationPending'
