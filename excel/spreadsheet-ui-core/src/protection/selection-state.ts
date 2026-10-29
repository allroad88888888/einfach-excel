import { atom } from '@einfach/core'
import { selectionAtom, getActiveCell, getSelectionRange } from '../selection'
import { getSheetProtection } from './sheet-state'
import { isCoordUnlocked, isRangeFullyUnlocked, isRangePartiallyUnlocked } from './range-coverage'
import { sheetProtectionAtom } from './source-atoms'

// --- protection-derived selection state ---

export const activeCellLockedAtom = atom((get): boolean => {
  const selection = get(selectionAtom)
  const protection = get(sheetProtectionAtom)
  const sheetId = selection.sheetId
  if (getSheetProtection(protection, sheetId).mode === 'open') return false
  return !isCoordUnlocked(protection, sheetId, getActiveCell(selection))
})
activeCellLockedAtom.debugLabel = 'spreadsheet.protection.activeCellLocked'

export const selectionLockedAtom = atom((get): 'open' | 'locked' | 'partial' => {
  const selection = get(selectionAtom)
  const protection = get(sheetProtectionAtom)
  const sheetId = selection.sheetId
  if (getSheetProtection(protection, sheetId).mode === 'open') return 'open'
  const range = getSelectionRange(selection)
  if (isRangeFullyUnlocked(protection, sheetId, range)) return 'open'
  if (isRangePartiallyUnlocked(protection, sheetId, range)) return 'partial'
  return 'locked'
})
selectionLockedAtom.debugLabel = 'spreadsheet.protection.selectionLocked'
