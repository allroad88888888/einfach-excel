import type { CellRange } from '../shared'
import type { SheetProtectionBySheet, SheetProtectionState } from './types'
import { isCellRange, rangesEqual, snapshotRange } from './range-guards'

export const MAX_UNLOCKED_RANGES = 256

const EMPTY_UNLOCKED_RANGES: readonly Readonly<CellRange>[] = Object.freeze([])

export const DEFAULT_SHEET_PROTECTION: SheetProtectionState = Object.freeze({
  mode: 'open',
  unlockedRanges: EMPTY_UNLOCKED_RANGES,
})

export const EMPTY_SHEET_PROTECTION: SheetProtectionBySheet = Object.freeze({})

/** Freeze a pre-validated protection state without retaining caller arrays. */
export function snapshotProtectionState(state: SheetProtectionState): SheetProtectionState {
  return Object.freeze({
    mode: state.mode,
    unlockedRanges: Object.freeze(state.unlockedRanges.map((range) => snapshotRange(range))),
  })
}

export function getSheetProtection(
  state: SheetProtectionBySheet,
  sheetId: string,
): SheetProtectionState {
  return Object.prototype.hasOwnProperty.call(state, sheetId)
    ? state[sheetId]
    : DEFAULT_SHEET_PROTECTION
}

export function isValidProtectionState(value: unknown): value is SheetProtectionState {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Partial<SheetProtectionState>
  if (state.mode !== 'open' && state.mode !== 'protected') return false
  return (
    Array.isArray(state.unlockedRanges) &&
    state.unlockedRanges.length <= MAX_UNLOCKED_RANGES &&
    state.unlockedRanges.every(isCellRange)
  )
}

export function protectionStatesEqual(
  first: SheetProtectionState,
  second: SheetProtectionState,
): boolean {
  return (
    first.mode === second.mode &&
    first.unlockedRanges.length === second.unlockedRanges.length &&
    first.unlockedRanges.every((range, index) => rangesEqual(range, second.unlockedRanges[index]))
  )
}
