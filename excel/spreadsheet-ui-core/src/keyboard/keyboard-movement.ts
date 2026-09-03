import type { CellCoord } from '../shared'
import {
  getActiveCell,
  moveSelection,
  normalizeSelection,
  type ActiveSelectionCell,
} from '../selection'
import type {
  KeyboardCommandIntent,
  KeyboardCommandState,
  KeyboardInput,
  KeyboardMoveReason,
  MoveSelectionIntent,
} from './types'

interface KeyboardMovement {
  rowDelta?: number
  colDelta?: number
  row?: number
  col?: number
}

/** Builds navigation-mode movement intents without retaining host geometry. */
export function getKeyboardMovementIntent(
  input: KeyboardInput,
  state: KeyboardCommandState,
): KeyboardCommandIntent {
  switch (input.key) {
    case 'ArrowUp':
      return createMoveIntent(input, state, 'arrow', getArrowMovement(input, state, -1, 0))
    case 'ArrowDown':
      return createMoveIntent(input, state, 'arrow', getArrowMovement(input, state, 1, 0))
    case 'ArrowLeft':
      return createMoveIntent(input, state, 'arrow', getArrowMovement(input, state, 0, -1))
    case 'ArrowRight':
      return createMoveIntent(input, state, 'arrow', getArrowMovement(input, state, 0, 1))
    case 'Tab':
      return createMoveIntent(input, state, 'tab', { colDelta: input.shiftKey ? -1 : 1 })
    case 'Enter':
      return createMoveIntent(input, state, 'enter', { rowDelta: input.shiftKey ? -1 : 1 })
    case 'Home':
      return createMoveIntent(input, state, 'home', {
        row: input.ctrlKey || input.metaKey ? 0 : undefined,
        col: 0,
      })
    case 'PageUp':
      if (input.altKey) {
        return createMoveIntent(input, state, 'page', {
          colDelta: -normalizePageDelta(input.pageColDelta),
        })
      }
      return createMoveIntent(input, state, 'page', {
        rowDelta: -normalizePageDelta(input.pageRowDelta),
      })
    case 'PageDown':
      if (input.altKey) {
        return createMoveIntent(input, state, 'page', {
          colDelta: normalizePageDelta(input.pageColDelta),
        })
      }
      return createMoveIntent(input, state, 'page', {
        rowDelta: normalizePageDelta(input.pageRowDelta),
      })
    case 'End':
      return createMoveIntent(input, state, 'end', {
        row: state.bounds.rowCount - 1,
        col: input.ctrlKey || input.metaKey ? state.bounds.colCount - 1 : undefined,
      })
    default:
      return { type: 'none', reason: 'unhandled' }
  }
}

function getArrowMovement(
  input: KeyboardInput,
  state: KeyboardCommandState,
  rowDirection: -1 | 0 | 1,
  colDirection: -1 | 0 | 1,
): KeyboardMovement {
  if (!input.ctrlKey && !input.metaKey) {
    return {
      rowDelta: rowDirection === 0 ? undefined : rowDirection,
      colDelta: colDirection === 0 ? undefined : colDirection,
    }
  }
  return {
    row: rowDirection === 0 ? undefined : rowDirection < 0 ? 0 : state.bounds.rowCount - 1,
    col: colDirection === 0 ? undefined : colDirection < 0 ? 0 : state.bounds.colCount - 1,
  }
}

function createMoveIntent(
  input: KeyboardInput,
  state: KeyboardCommandState,
  reason: KeyboardMoveReason,
  movement: KeyboardMovement,
): MoveSelectionIntent {
  const currentSelection = normalizeSelection(state.selection, state.bounds)
  const from = stripSheetId(getActiveCell(currentSelection, state.bounds))
  const extend = input.key === 'Tab' ? false : Boolean(input.shiftKey)
  const mergeAwareMovement = getMergeAwareArrowMovement(input, reason, movement, from)
  const rawSelection = moveSelection(currentSelection, state.bounds, {
    ...mergeAwareMovement,
    extend,
  })
  const rawTo = stripSheetId(getActiveCell(rawSelection, state.bounds))
  const to = getMergeAwareArrowDestination(input, state, reason, from, rawTo)
  const selection =
    to.row === rawTo.row && to.col === rawTo.col
      ? rawSelection
      : moveSelection(currentSelection, state.bounds, { row: to.row, col: to.col, extend: false })

  return {
    type: 'selection.move',
    reason,
    key: input.key,
    extend,
    from,
    to,
    scroll: { type: 'viewport.scrollToCell', target: to },
    selection,
  }
}

function getMergeAwareArrowMovement(
  input: KeyboardInput,
  reason: KeyboardMoveReason,
  movement: KeyboardMovement,
  from: CellCoord,
): KeyboardMovement {
  if (!isMergeAwareArrowInput(input, reason)) return movement
  const range = input.resolveMergeRange!(from.row, from.col)
  if (!range) return movement
  return {
    ...movement,
    row: movement.rowDelta === undefined ? range.rowStart : range.rowStart + movement.rowDelta,
    col: movement.colDelta === undefined ? range.colStart : range.colStart + movement.colDelta,
  }
}

function getMergeAwareArrowDestination(
  input: KeyboardInput,
  state: KeyboardCommandState,
  reason: KeyboardMoveReason,
  from: CellCoord,
  rawTo: CellCoord,
): CellCoord {
  if (!isMergeAwareArrowInput(input, reason)) return rawTo
  const sourceRange = input.resolveMergeRange!(from.row, from.col)
  if (sourceRange && isCoordInRange(rawTo, sourceRange)) {
    return getCoordAfterMerge(sourceRange, input.key, state, rawTo)
  }
  const destinationRange = input.resolveMergeRange!(rawTo.row, rawTo.col)
  return destinationRange
    ? { row: destinationRange.rowStart, col: destinationRange.colStart }
    : rawTo
}

function isMergeAwareArrowInput(input: KeyboardInput, reason: KeyboardMoveReason): boolean {
  return Boolean(
    input.resolveMergeRange &&
      reason === 'arrow' &&
      !input.shiftKey &&
      !input.ctrlKey &&
      !input.metaKey &&
      !input.altKey,
  )
}

function isCoordInRange(
  coord: CellCoord,
  range: { rowStart: number; rowEnd: number; colStart: number; colEnd: number },
) {
  return (
    coord.row >= range.rowStart &&
    coord.row <= range.rowEnd &&
    coord.col >= range.colStart &&
    coord.col <= range.colEnd
  )
}

function getCoordAfterMerge(
  range: { rowStart: number; rowEnd: number; colStart: number; colEnd: number },
  key: KeyboardInput['key'],
  state: KeyboardCommandState,
  fallback: CellCoord,
): CellCoord {
  switch (key) {
    case 'ArrowUp':
      return range.rowStart === 0
        ? { row: range.rowStart, col: range.colStart }
        : { row: range.rowStart - 1, col: range.colStart }
    case 'ArrowDown':
      return range.rowEnd >= state.bounds.rowCount - 1
        ? { row: range.rowStart, col: range.colStart }
        : { row: range.rowEnd + 1, col: range.colStart }
    case 'ArrowLeft':
      return range.colStart === 0
        ? { row: range.rowStart, col: range.colStart }
        : { row: range.rowStart, col: range.colStart - 1 }
    case 'ArrowRight':
      return range.colEnd >= state.bounds.colCount - 1
        ? { row: range.rowStart, col: range.colStart }
        : { row: range.rowStart, col: range.colEnd + 1 }
    default:
      return fallback
  }
}

function normalizePageDelta(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 20
  return Math.max(1, Math.trunc(Math.abs(value)))
}

function stripSheetId(cell: ActiveSelectionCell): CellCoord {
  return { row: cell.row, col: cell.col }
}
