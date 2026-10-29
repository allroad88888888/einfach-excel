import {
  snapshotCellCoordInput,
  snapshotOptionalBoolean,
  snapshotOptionalSheetId,
  snapshotSelectionInput,
  validSafeInteger,
  MAX_SELECTION_REGIONS,
} from './selection-input-snapshot'
import type { SelectionInputSnapshot } from './selection-input-snapshot'
import type { CellCoord } from '../shared'
import type { ClearSelectionRegionsInput, SelectionRegion, SelectionState } from './types'

export interface SelectCellInputSnapshot {
  readonly coord: CellCoord
  readonly sheetId?: string
  readonly extend?: boolean
}

export function snapshotSelectCellInput(
  candidate: unknown,
): SelectionInputSnapshot<SelectCellInputSnapshot> {
  if (candidate === null || typeof candidate !== 'object') return { kind: 'invalid' }
  try {
    const record = candidate as Record<string, unknown>
    const coord = snapshotCellCoordInput(record.coord)
    const sheetId = snapshotOptionalSheetId(record.sheetId)
    const extend = snapshotOptionalBoolean(record.extend)
    if (coord.kind === 'invalid' || sheetId.kind === 'invalid' || extend.kind === 'invalid') {
      return { kind: 'invalid' }
    }
    return {
      kind: 'valid',
      value: Object.freeze({
        coord: coord.value,
        sheetId: sheetId.value,
        extend: extend.value,
      }),
    }
  } catch {
    return { kind: 'invalid' }
  }
}

export interface SelectRowsInputSnapshot {
  readonly rowAnchor: number
  readonly rowFocus?: number
  readonly sheetId?: string
}

export function snapshotSelectRowsInput(
  candidate: unknown,
): SelectionInputSnapshot<SelectRowsInputSnapshot> {
  if (candidate === null || typeof candidate !== 'object') return { kind: 'invalid' }
  try {
    const record = candidate as Record<string, unknown>
    const rowAnchor = record.rowAnchor
    const rowFocus = record.rowFocus
    const sheetId = snapshotOptionalSheetId(record.sheetId)
    if (
      !validSafeInteger(rowAnchor) ||
      (rowFocus !== undefined && !validSafeInteger(rowFocus)) ||
      sheetId.kind === 'invalid'
    ) {
      return { kind: 'invalid' }
    }
    return {
      kind: 'valid',
      value: Object.freeze({ rowAnchor, rowFocus, sheetId: sheetId.value }),
    }
  } catch {
    return { kind: 'invalid' }
  }
}

export interface SelectColumnsInputSnapshot {
  readonly colAnchor: number
  readonly colFocus?: number
  readonly sheetId?: string
}

export function snapshotSelectColumnsInput(
  candidate: unknown,
): SelectionInputSnapshot<SelectColumnsInputSnapshot> {
  if (candidate === null || typeof candidate !== 'object') return { kind: 'invalid' }
  try {
    const record = candidate as Record<string, unknown>
    const colAnchor = record.colAnchor
    const colFocus = record.colFocus
    const sheetId = snapshotOptionalSheetId(record.sheetId)
    if (
      !validSafeInteger(colAnchor) ||
      (colFocus !== undefined && !validSafeInteger(colFocus)) ||
      sheetId.kind === 'invalid'
    ) {
      return { kind: 'invalid' }
    }
    return {
      kind: 'valid',
      value: Object.freeze({ colAnchor, colFocus, sheetId: sheetId.value }),
    }
  } catch {
    return { kind: 'invalid' }
  }
}

export interface AddSelectionRegionInputSnapshot {
  readonly region: SelectionRegion
  readonly makePrimary?: boolean
}

export function snapshotAddSelectionRegionInput(
  candidate: unknown,
): SelectionInputSnapshot<AddSelectionRegionInputSnapshot> {
  if (candidate === null || typeof candidate !== 'object') return { kind: 'invalid' }
  try {
    const record = candidate as Record<string, unknown>
    const region = snapshotSelectionInput(record.region)
    const makePrimary = snapshotOptionalBoolean(record.makePrimary)
    if (
      region.kind === 'invalid' ||
      region.value.kind === 'all' ||
      makePrimary.kind === 'invalid'
    ) {
      return { kind: 'invalid' }
    }
    return {
      kind: 'valid',
      value: Object.freeze({
        region: region.value,
        makePrimary: makePrimary.value,
      }),
    }
  } catch {
    return { kind: 'invalid' }
  }
}

export interface SetMultiRegionSelectionInputSnapshot {
  readonly regions: readonly SelectionState[]
  readonly primaryIndex?: number
}

export function snapshotSetMultiRegionSelectionInput(
  candidate: unknown,
): SelectionInputSnapshot<SetMultiRegionSelectionInputSnapshot> {
  if (candidate === null || typeof candidate !== 'object') return { kind: 'invalid' }
  try {
    const record = candidate as Record<string, unknown>
    const primaryIndex = record.primaryIndex
    if (primaryIndex !== undefined && (!validSafeInteger(primaryIndex) || primaryIndex < 0)) {
      return { kind: 'invalid' }
    }
    const regionCandidates = record.regions
    if (!Array.isArray(regionCandidates)) return { kind: 'invalid' }
    const regionCount = regionCandidates.length
    if (
      !validSafeInteger(regionCount) ||
      regionCount > MAX_SELECTION_REGIONS ||
      (primaryIndex !== undefined &&
        (regionCount === 0 ? primaryIndex !== 0 : primaryIndex >= regionCount))
    ) {
      return { kind: 'invalid' }
    }
    const regions: SelectionState[] = []
    for (let index = 0; index < regionCount; index += 1) {
      const region = snapshotSelectionInput(regionCandidates[index])
      if (region.kind === 'invalid') return { kind: 'invalid' }
      regions.push(region.value)
    }
    return {
      kind: 'valid',
      value: Object.freeze({
        regions: Object.freeze(regions),
        primaryIndex,
      }),
    }
  } catch {
    return { kind: 'invalid' }
  }
}

export function snapshotClearSelectionRegionsInput(
  candidate: unknown,
): SelectionInputSnapshot<Readonly<ClearSelectionRegionsInput> | undefined> {
  if (candidate === undefined) return { kind: 'valid', value: undefined }
  if (candidate === null || typeof candidate !== 'object') return { kind: 'invalid' }
  try {
    const keepPrimary = snapshotOptionalBoolean((candidate as Record<string, unknown>).keepPrimary)
    return keepPrimary.kind === 'invalid'
      ? { kind: 'invalid' }
      : { kind: 'valid', value: Object.freeze({ keepPrimary: keepPrimary.value }) }
  } catch {
    return { kind: 'invalid' }
  }
}
