import type { CellRange } from '../shared'
import type {
  SheetProtectionBySheet,
  SheetProtectionPermissions,
  SheetProtectionState,
} from './types'
import { isCellRange, rangesEqual, snapshotRange } from './range-guards'

export const MAX_UNLOCKED_RANGES = 256

const EMPTY_UNLOCKED_RANGES: readonly Readonly<CellRange>[] = Object.freeze([])

export const DEFAULT_PROTECTION_PERMISSIONS: SheetProtectionPermissions = Object.freeze({
  sort: false,
  insertRows: false,
  insertColumns: false,
  deleteRows: false,
  deleteColumns: false,
})

export const DEFAULT_SHEET_PROTECTION: SheetProtectionState = Object.freeze({
  mode: 'open',
  unlockedRanges: EMPTY_UNLOCKED_RANGES,
})

export const EMPTY_SHEET_PROTECTION: SheetProtectionBySheet = Object.freeze({})

export function getProtectionPermissions(
  state: Pick<SheetProtectionState, 'permissions'> | null | undefined,
): SheetProtectionPermissions {
  const perms = state?.permissions
  if (!perms) return DEFAULT_PROTECTION_PERMISSIONS
  return {
    sort: Boolean(perms.sort),
    insertRows: Boolean(perms.insertRows),
    insertColumns: Boolean(perms.insertColumns),
    deleteRows: Boolean(perms.deleteRows),
    deleteColumns: Boolean(perms.deleteColumns),
  }
}

export function isValidProtectionPermissions(
  value: unknown,
): value is SheetProtectionPermissions {
  if (typeof value !== 'object' || value === null) return false
  const perms = value as Partial<SheetProtectionPermissions>
  return (
    typeof perms.sort === 'boolean' &&
    typeof perms.insertRows === 'boolean' &&
    typeof perms.insertColumns === 'boolean' &&
    typeof perms.deleteRows === 'boolean' &&
    typeof perms.deleteColumns === 'boolean'
  )
}

function hasCustomPermissions(perms: SheetProtectionPermissions | undefined): boolean {
  return Boolean(
    perms &&
      (perms.sort ||
        perms.insertRows ||
        perms.insertColumns ||
        perms.deleteRows ||
        perms.deleteColumns),
  )
}

/** Freeze a pre-validated protection state without retaining caller arrays. */
export function snapshotProtectionState(state: SheetProtectionState): SheetProtectionState {
  const perms = state.permissions
  return Object.freeze({
    mode: state.mode,
    unlockedRanges: Object.freeze(state.unlockedRanges.map((range) => snapshotRange(range))),
    ...(hasCustomPermissions(perms) ? { permissions: Object.freeze({ ...perms! }) } : {}),
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
  if (state.permissions !== undefined && !isValidProtectionPermissions(state.permissions)) {
    return false
  }
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
  const a = getProtectionPermissions(first)
  const b = getProtectionPermissions(second)
  return (
    first.mode === second.mode &&
    first.unlockedRanges.length === second.unlockedRanges.length &&
    first.unlockedRanges.every((range, index) =>
      rangesEqual(range, second.unlockedRanges[index]),
    ) &&
    a.sort === b.sort &&
    a.insertRows === b.insertRows &&
    a.insertColumns === b.insertColumns &&
    a.deleteRows === b.deleteRows &&
    a.deleteColumns === b.deleteColumns
  )
}
