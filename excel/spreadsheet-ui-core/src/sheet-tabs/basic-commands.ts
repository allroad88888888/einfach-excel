import { atom } from '@einfach/core'
import { applySheetTabIntent } from './intents'
import { normalizeSheetMetadataList, normalizeSheetTabDraftName } from './metadata'
import { activateSheetTab } from './projection'
import { sheetTabsAtom, sheetTabsSheetStateAtom } from './state'
import type { ActivateSheetTabInput, SetSheetTabsSheetsInput, SheetTabIntent, SheetTabsSheetState, SheetTabsState } from './types'

export const activateSheetTabAtom = atom(null, (get, set, input: ActivateSheetTabInput): boolean => activateSheetTab(get, set, input))
export const dispatchSheetTabIntentAtom = atom((get) => get(sheetTabsAtom), (get, set, intent: SheetTabIntent): SheetTabsState => {
  const current = get(sheetTabsAtom)
  if (current.phase !== 'ready' || current.mutation !== null) return current
  const next = applySheetTabIntent(current, intent)
  set(sheetTabsAtom, next)
  return next
})
export const setSheetTabsSheetsAtom = atom((get) => get(sheetTabsSheetStateAtom), (_get, set, input: SetSheetTabsSheetsInput): SheetTabsSheetState => {
  const next = { sheets: normalizeSheetMetadataList(input.sheets), revision: input.revision }
  set(sheetTabsSheetStateAtom, next)
  return next
})
export const patchSheetTabsSheetNameAtom = atom((get) => get(sheetTabsSheetStateAtom), (get, set, input: { sheetId: string; name: string }): SheetTabsSheetState => {
  const name = normalizeSheetTabDraftName(input.name)
  if (name === null) return get(sheetTabsSheetStateAtom)
  const current = get(sheetTabsSheetStateAtom)
  const next = { ...current, sheets: current.sheets.map((sheet) => sheet.id === input.sheetId ? { ...sheet, name } : sheet) }
  set(sheetTabsSheetStateAtom, next)
  return next
})
activateSheetTabAtom.debugLabel = 'spreadsheet.sheetTabs.activate'
dispatchSheetTabIntentAtom.debugLabel = 'spreadsheet.sheetTabs.dispatchIntent'
setSheetTabsSheetsAtom.debugLabel = 'spreadsheet.sheetTabs.setSheets'
patchSheetTabsSheetNameAtom.debugLabel = 'spreadsheet.sheetTabs.patchSheetName'
