export * from './types'

// React's Rust Worker path hydrates this UI projection from accepted native
// results. Protection changes are intentionally NOT recorded in undo history,
// and UI-core never stores or hashes a protection password — see README.md
// and the file-level notes in commands.ts / unlock-submit.ts.

export { MAX_UNLOCKED_RANGES, DEFAULT_SHEET_PROTECTION, getSheetProtection } from './sheet-state'
export { rangesIntersect } from './range-guards'
export { isCoordUnlocked, isRangeFullyUnlocked, isRangePartiallyUnlocked } from './range-coverage'
export {
  sheetProtectionAtom,
  resetSheetProtectionProjectionAtom,
  sheetProtectionDiagnosticAtom,
} from './source-atoms'
export type { SheetProtectionDiagnostic, SheetProtectionCommandOutcome } from './source-atoms'
export type { SheetProtectionPersistencePort } from './persistence'
export {
  setSheetProtectionAtom,
  clearSheetProtectionAtom,
  protectSheetAtom,
  unprotectSheetAtom,
  addUnlockedRangeAtom,
  removeUnlockedRangeAtom,
} from './commands'
export type {
  SetSheetProtectionCommandInput,
  ClearSheetProtectionCommandInput,
  ProtectSheetCommandInput,
  UnprotectSheetCommandInput,
  UnlockedRangeCommandInput,
} from './commands'
export { hydrateSheetProtectionAtom } from './hydrate'
export type { HydrateSheetProtectionInput, HydrateSheetProtectionOutcome } from './hydrate'
export { activeCellLockedAtom, selectionLockedAtom } from './selection-state'
export {
  DEFAULT_PROTECTION_UNLOCK_STATE,
  protectionUnlockStateAtom,
  protectionUnlockPasswordAtom,
  protectionUnlockPhaseAtom,
  protectionUnlockOpenAtom,
  setProtectionUnlockPasswordAtom,
  openProtectionUnlockAtom,
  closeProtectionUnlockAtom,
} from './unlock-state'
export type {
  ProtectionUnlockPhase,
  ProtectionUnlockTarget,
  ProtectionUnlockState,
  VerifySheetProtectionInput,
  VerifySheetProtectionResult,
  VerifySheetProtectionPort,
  SubmitProtectionUnlockInput,
} from './unlock-state'
export { submitProtectionUnlockAtom } from './unlock-submit'
