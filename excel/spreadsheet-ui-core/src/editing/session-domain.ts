/**
 * Pure editing-session transitions.
 *
 * This module owns no atoms or I/O. Every published state detaches nested caller-owned
 * values so later mutation cannot silently rewrite an already-observed snapshot.
 */
import type {
  EditingCancelIntent,
  EditingCommitInput,
  EditingCommitIntent,
  EditingDraftInput,
  EditingSessionState,
  EditingSourceCell,
  EditingStartInput,
  EditingStartIntent,
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
    diagnostic: state.diagnostic === null ? null : Object.freeze({ ...state.diagnostic }),
  })
}

export function createEditingSessionState(): EditingSessionState {
  return Object.freeze({
    status: 'idle',
    source: null,
    draft: '',
    diagnostic: null,
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
    diagnostic: null,
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

export function commitEditingSessionState(
  state: EditingSessionState,
  input: EditingCommitInput,
): EditingSessionState {
  if (state.source === null) return state

  // Committing only freezes the submitted draft here; async acknowledgement owns completion.
  return snapshotSession({
    status: 'drafting',
    source: {
      ...state.source,
      source: input.source ?? state.source.source,
    },
    draft: input.input,
    diagnostic: null,
  })
}

export function cancelEditingSessionState(state: EditingSessionState): EditingSessionState {
  if (state.source === null && state.status === 'idle') return state

  return Object.freeze({
    status: 'cancelled',
    source: null,
    draft: '',
    diagnostic: null,
  })
}

export function createEditingStartIntent(input: EditingStartInput): EditingStartIntent {
  return {
    type: 'editing.start',
    sheetId: input.sheetId,
    cell: { row: input.cell.row, col: input.cell.col },
    source: input.source,
  }
}

export function createEditingCommitIntent(
  state: EditingSessionState,
  input: EditingCommitInput,
): EditingCommitIntent | null {
  if (state.source === null) return null

  return {
    type: 'editing.commit',
    sheetId: state.source.sheetId,
    cell: { row: state.source.cell.row, col: state.source.cell.col },
    source: input.source ?? state.source.source,
    input: input.input,
    move: input.move ?? 'none',
  }
}

export function createEditingCancelIntent(state: EditingSessionState): EditingCancelIntent | null {
  if (state.source === null) return null

  return {
    type: 'editing.cancel',
    sheetId: state.source.sheetId,
    cell: { row: state.source.cell.row, col: state.source.cell.col },
    source: state.source.source,
  }
}
