import { assertNever, normalizeSelectionBounds } from './geometry'
import type { MultiRangeSelectionState, SelectionBounds, SelectionState } from './types'

export function toMultiRange(state: SelectionState): MultiRangeSelectionState {
  return { regions: [state], primaryIndex: 0 }
}

export function getPrimaryRegion(multi: MultiRangeSelectionState): SelectionState {
  return multi.regions[multi.primaryIndex] ?? multi.regions[0]
}

export function copySelection(selection: SelectionState): SelectionState {
  switch (selection.kind) {
    case 'cell':
      return Object.freeze({
        kind: 'cell',
        sheetId: selection.sheetId,
        anchor: Object.freeze({ ...selection.anchor }),
        focus: Object.freeze({ ...selection.focus }),
      })
    case 'range':
      return Object.freeze({
        kind: 'range',
        sheetId: selection.sheetId,
        anchor: Object.freeze({ ...selection.anchor }),
        focus: Object.freeze({ ...selection.focus }),
      })
    case 'row':
      return Object.freeze({
        kind: 'row',
        sheetId: selection.sheetId,
        rowAnchor: selection.rowAnchor,
        rowFocus: selection.rowFocus,
      })
    case 'column':
      return Object.freeze({
        kind: 'column',
        sheetId: selection.sheetId,
        colAnchor: selection.colAnchor,
        colFocus: selection.colFocus,
      })
    case 'all':
      return Object.freeze({
        kind: 'all',
        sheetId: selection.sheetId,
      })
    default:
      return assertNever(selection)
  }
}

export function copySelectionRegions(
  regions: readonly SelectionState[],
): readonly SelectionState[] {
  return Object.freeze(regions.map(copySelection))
}

export function snapshotSelectionBounds(bounds: SelectionBounds): SelectionBounds {
  return Object.freeze({
    rowCount: bounds.rowCount,
    colCount: bounds.colCount,
  })
}

export function snapshotMultiSelectionState(
  state: MultiRangeSelectionState,
): MultiRangeSelectionState {
  return Object.freeze({
    regions: copySelectionRegions(state.regions),
    primaryIndex: state.primaryIndex,
  })
}

export function sameNormalizedSelectionBounds(
  left: SelectionBounds,
  right: SelectionBounds,
): boolean {
  const normalizedLeft = normalizeSelectionBounds(left)
  const normalizedRight = normalizeSelectionBounds(right)
  return (
    normalizedLeft.rowCount === normalizedRight.rowCount &&
    normalizedLeft.colCount === normalizedRight.colCount
  )
}
