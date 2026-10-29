import { atom, type Getter, type Setter } from '@einfach/core'
import type { CellRange } from '../shared'
import type { SheetProtectionState } from './types'
import {
  DEFAULT_SHEET_PROTECTION,
  MAX_UNLOCKED_RANGES,
  getSheetProtection,
  isValidProtectionState,
  protectionStatesEqual,
} from './sheet-state'
import { isCellRange, rangesEqual, snapshotRange } from './range-guards'
import { isRangeFullyUnlocked } from './range-coverage'
import {
  markSheetProtectionSeeded,
  sheetProtectionSourceAtom,
  writeSheetProtection,
} from './source-atoms'
import type { SheetProtectionCommandOutcome } from './source-atoms'
import { persistProtectionState, persistRangeLock } from './persistence'
import type { SheetProtectionPersistencePort } from './persistence'

// --- commands (synchronous local commit; no undo history by design) ---

export interface SetSheetProtectionCommandInput {
  readonly sheetId: string
  readonly state: SheetProtectionState
  /** Optional persistence hook; a failure records a diagnostic and never rolls back. */
  readonly source?: SheetProtectionPersistencePort
}

export interface ClearSheetProtectionCommandInput {
  readonly sheetId: string
  readonly source?: SheetProtectionPersistencePort
}

export interface ProtectSheetCommandInput {
  readonly sheetId: string
  /** Replaces the sheet's unlocked ranges; existing ranges are preserved when omitted. */
  readonly unlockedRanges?: readonly Readonly<CellRange>[]
  readonly source?: SheetProtectionPersistencePort
}

export interface UnprotectSheetCommandInput {
  readonly sheetId: string
  readonly source?: SheetProtectionPersistencePort
}

export interface UnlockedRangeCommandInput {
  readonly sheetId: string
  readonly range: Readonly<CellRange>
  readonly source?: SheetProtectionPersistencePort
}

/** Command: replace the canonical protection state for a sheet. */
export const setSheetProtectionAtom = atom(
  null,
  (get, set, input: SetSheetProtectionCommandInput): SheetProtectionCommandOutcome => {
    const sheetId = typeof input?.sheetId === 'string' ? input.sheetId : ''
    if (!sheetId || !isValidProtectionState(input?.state)) return 'invalid'
    markSheetProtectionSeeded(get, set, sheetId)
    const state = get(sheetProtectionSourceAtom)
    const hasEntry = Object.prototype.hasOwnProperty.call(state, sheetId)
    const current = getSheetProtection(state, sheetId)
    if (protectionStatesEqual(current, input.state) && (hasEntry || input.state.mode === 'open')) {
      return 'unchanged'
    }
    const next = writeSheetProtection(get, set, sheetId, input.state)
    persistProtectionState(set, input.source, sheetId, next)
    return 'committed'
  },
)
setSheetProtectionAtom.debugLabel = 'spreadsheet.protection.set'

/** Command: remove the canonical protection entry for a sheet. */
export const clearSheetProtectionAtom = atom(
  null,
  (get, set, input: string | ClearSheetProtectionCommandInput): SheetProtectionCommandOutcome => {
    const sheetId =
      typeof input === 'string' ? input : typeof input?.sheetId === 'string' ? input.sheetId : ''
    const source = typeof input === 'string' ? undefined : input?.source
    if (!sheetId) return 'invalid'
    markSheetProtectionSeeded(get, set, sheetId)
    const state = get(sheetProtectionSourceAtom)
    if (!Object.prototype.hasOwnProperty.call(state, sheetId)) return 'unchanged'
    const next = { ...state }
    delete next[sheetId]
    set(sheetProtectionSourceAtom, Object.freeze(next))
    persistProtectionState(set, source, sheetId, DEFAULT_SHEET_PROTECTION)
    return 'committed'
  },
)
clearSheetProtectionAtom.debugLabel = 'spreadsheet.protection.clear'

/** Command: protect a sheet, preserving its unlocked ranges unless replaced. */
export const protectSheetAtom = atom(
  null,
  (get, set, input: ProtectSheetCommandInput): SheetProtectionCommandOutcome => {
    const sheetId = typeof input?.sheetId === 'string' ? input.sheetId : ''
    if (!sheetId) return 'invalid'
    const replacement = input?.unlockedRanges
    if (
      replacement !== undefined &&
      (!Array.isArray(replacement) ||
        replacement.length > MAX_UNLOCKED_RANGES ||
        !replacement.every(isCellRange))
    ) {
      return 'invalid'
    }
    markSheetProtectionSeeded(get, set, sheetId)
    const current = getSheetProtection(get(sheetProtectionSourceAtom), sheetId)
    const nextState: SheetProtectionState = {
      mode: 'protected',
      unlockedRanges: replacement ?? current.unlockedRanges,
    }
    if (current.mode === 'protected' && protectionStatesEqual(current, nextState)) {
      return 'unchanged'
    }
    const next = writeSheetProtection(get, set, sheetId, nextState)
    persistProtectionState(set, input.source, sheetId, next)
    return 'committed'
  },
)
protectSheetAtom.debugLabel = 'spreadsheet.protection.protectSheet'

/** Command: unprotect a sheet. Unlocked ranges are preserved for a later re-protect. */
export const unprotectSheetAtom = atom(
  null,
  (get, set, input: UnprotectSheetCommandInput): SheetProtectionCommandOutcome => {
    const sheetId = typeof input?.sheetId === 'string' ? input.sheetId : ''
    if (!sheetId) return 'invalid'
    markSheetProtectionSeeded(get, set, sheetId)
    const current = getSheetProtection(get(sheetProtectionSourceAtom), sheetId)
    if (current.mode === 'open') return 'unchanged'
    const next = writeSheetProtection(get, set, sheetId, {
      mode: 'open',
      unlockedRanges: current.unlockedRanges,
    })
    persistProtectionState(set, input.source, sheetId, next)
    return 'committed'
  },
)
unprotectSheetAtom.debugLabel = 'spreadsheet.protection.unprotectSheet'

export function addUnlockedRange(
  get: Getter,
  set: Setter,
  input: UnlockedRangeCommandInput,
): SheetProtectionCommandOutcome {
  const sheetId = typeof input?.sheetId === 'string' ? input.sheetId : ''
  if (!sheetId || !isCellRange(input?.range)) return 'invalid'
  markSheetProtectionSeeded(get, set, sheetId)
  const state = get(sheetProtectionSourceAtom)
  // Already editable (open sheet or fully covered by existing ranges).
  if (isRangeFullyUnlocked(state, sheetId, input.range)) return 'unchanged'
  const current = getSheetProtection(state, sheetId)
  if (current.unlockedRanges.length >= MAX_UNLOCKED_RANGES) return 'invalid'
  const nextState: SheetProtectionState = {
    mode: current.mode,
    unlockedRanges: [...current.unlockedRanges, snapshotRange(input.range)],
  }
  const next = writeSheetProtection(get, set, sheetId, nextState)
  persistRangeLock(set, input.source, sheetId, input.range, false, next)
  return 'committed'
}

/**
 * Command: add an unlocked (allow-edit) range on a protected sheet.
 * 'unchanged' when the range is already editable; 'invalid' when the
 * 256-range cap is reached.
 */
export const addUnlockedRangeAtom = atom(
  null,
  (get, set, input: UnlockedRangeCommandInput): SheetProtectionCommandOutcome =>
    addUnlockedRange(get, set, input),
)
addUnlockedRangeAtom.debugLabel = 'spreadsheet.protection.addUnlockedRange'

/** Command: remove an exactly matching unlocked range. 'unchanged' when absent. */
export const removeUnlockedRangeAtom = atom(
  null,
  (get, set, input: UnlockedRangeCommandInput): SheetProtectionCommandOutcome => {
    const sheetId = typeof input?.sheetId === 'string' ? input.sheetId : ''
    if (!sheetId || !isCellRange(input?.range)) return 'invalid'
    markSheetProtectionSeeded(get, set, sheetId)
    const current = getSheetProtection(get(sheetProtectionSourceAtom), sheetId)
    const remaining = current.unlockedRanges.filter((range) => !rangesEqual(range, input.range))
    if (remaining.length === current.unlockedRanges.length) return 'unchanged'
    const next = writeSheetProtection(get, set, sheetId, {
      mode: current.mode,
      unlockedRanges: remaining,
    })
    persistRangeLock(set, input.source, sheetId, input.range, true, next)
    return 'committed'
  },
)
removeUnlockedRangeAtom.debugLabel = 'spreadsheet.protection.removeUnlockedRange'
