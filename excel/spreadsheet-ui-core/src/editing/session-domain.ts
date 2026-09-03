/**
 * Pure editing-session transitions.
 *
 * This module owns no atoms or I/O. Every published state detaches nested caller-owned
 * values so later mutation cannot silently rewrite an already-observed snapshot.
 */
import type {
  EditingDraftInput,
  EditingSessionState,
  EditingSourceCell,
  EditingStartInput,
} from './types'

function snapshotSource(source: EditingSourceCell): EditingSourceCell {
  return Object.freeze({
    sheetId: source.sheetId,
    cell: Object.freeze({ row: source.cell.row, col: source.cell.col }),
    source: source.source,
  })
}

function snapshotSession(state: EditingSessionState): EditingSessionState {
  return Object.freeze({
    status: state.status,
    source: state.source === null ? null : snapshotSource(state.source),
    draft: state.draft,
  })
}

export function createEditingSessionState(): EditingSessionState {
  return Object.freeze({
    status: 'idle',
    source: null,
    draft: '',
  })
}

export function startEditingSessionState(
  _state: EditingSessionState,
  input: EditingStartInput,
): EditingSessionState {
  return snapshotSession({
    status: 'drafting',
    source: {
      sheetId: input.sheetId,
      cell: {
        row: input.cell.row,
        col: input.cell.col,
      },
      source: input.source,
    },
    draft: input.draft,
  })
}

export function updateEditingDraftState(
  state: EditingSessionState,
  input: EditingDraftInput,
): EditingSessionState {
  // A draft without a source cell is not actionable, so idle writes are intentional no-ops.
  if (state.status === 'idle' && state.source === null) return state

  return snapshotSession({
    ...state,
    status: 'drafting',
    draft: input.draft,
    source: state.source
      ? {
          sheetId: state.source.sheetId,
          cell: {
            row: state.source.cell.row,
            col: state.source.cell.col,
          },
          source: input.source ?? state.source.source,
        }
      : null,
  })
}

export function cancelEditingSessionState(state: EditingSessionState): EditingSessionState {
  if (state.source === null && state.status === 'idle') return state
  return createEditingSessionState()
}
