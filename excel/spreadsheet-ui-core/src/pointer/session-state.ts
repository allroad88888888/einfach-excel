import { copyCellCoord, copyCellRange, normalizeCellRange } from './pointer-coords'
import type {
  PointerAutoscrollInput,
  PointerAutoscrollState,
  PointerColumnResizeSession,
  PointerColumnResizeStartInput,
  PointerColumnResizeUpdateInput,
  PointerDragSelectionSession,
  PointerFillHandleSession,
  PointerFillHandleStartInput,
  PointerFillHandleUpdateInput,
  PointerInteractionState,
  PointerRowResizeSession,
  PointerRowResizeStartInput,
  PointerRowResizeUpdateInput,
  PointerSelectionStartInput,
  PointerSelectionUpdateInput,
  PointerSessionState,
  PointerStartInput,
  PointerUpdateInput,
} from './types'

function patchAutoscrollState(
  state: PointerAutoscrollState | null,
  input?: PointerAutoscrollInput | null,
): PointerAutoscrollState | null {
  if (input === undefined) {
    return state
  }

  if (input === null) {
    return null
  }

  return {
    active: input.active === undefined ? (state?.active ?? true) : input.active,
    edge: input.edge === undefined ? (state?.edge ?? null) : input.edge,
    deltaX: input.deltaX === undefined ? (state?.deltaX ?? 0) : input.deltaX,
    deltaY: input.deltaY === undefined ? (state?.deltaY ?? 0) : input.deltaY,
  }
}

function createIdlePointerState(): PointerSessionState {
  return {
    status: 'idle',
    source: null,
    interaction: null,
    autoscroll: null,
  }
}

function isDragSelectionInput(
  input: PointerStartInput | PointerUpdateInput,
): input is PointerSelectionStartInput | PointerSelectionUpdateInput {
  return input.kind === 'drag-selection'
}

function isFillHandleInput(
  input: PointerStartInput | PointerUpdateInput,
): input is PointerFillHandleStartInput | PointerFillHandleUpdateInput {
  return input.kind === 'fill-handle'
}

function isRowResizeInput(
  input: PointerStartInput | PointerUpdateInput,
): input is PointerRowResizeStartInput | PointerRowResizeUpdateInput {
  return input.kind === 'row-resize'
}

function isColumnResizeInput(
  input: PointerStartInput | PointerUpdateInput,
): input is PointerColumnResizeStartInput | PointerColumnResizeUpdateInput {
  return input.kind === 'column-resize'
}

function buildDragSelectionSession(input: PointerSelectionStartInput): PointerDragSelectionSession {
  const anchor = copyCellCoord(input.anchor)
  const focus = copyCellCoord(input.focus ?? input.anchor)

  return {
    kind: 'drag-selection',
    sheetId: input.sheetId,
    anchor,
    focus,
    range: normalizeCellRange(anchor, focus),
    ...(input.append ? { append: true } : {}),
  }
}

function buildFillHandleSession(input: PointerFillHandleStartInput): PointerFillHandleSession {
  return {
    kind: 'fill-handle',
    sheetId: input.sheetId,
    sourceRange: copyCellRange(input.sourceRange),
    focus: input.focus ? copyCellCoord(input.focus) : null,
    previewRange: input.previewRange ? copyCellRange(input.previewRange) : null,
    direction: input.direction ?? null,
    ...(input.copyOnly === undefined ? {} : { copyOnly: input.copyOnly }),
  }
}

function buildRowResizeSession(input: PointerRowResizeStartInput): PointerRowResizeSession {
  return {
    kind: 'row-resize',
    sheetId: input.sheetId,
    rowIndex: input.rowIndex,
    startSizePx: input.startSizePx ?? null,
    previewSizePx: input.previewSizePx ?? null,
  }
}

function buildColumnResizeSession(
  input: PointerColumnResizeStartInput,
): PointerColumnResizeSession {
  return {
    kind: 'column-resize',
    sheetId: input.sheetId,
    colIndex: input.colIndex,
    startSizePx: input.startSizePx ?? null,
    previewSizePx: input.previewSizePx ?? null,
  }
}

function buildInteraction(input: PointerStartInput): PointerInteractionState {
  if (isDragSelectionInput(input)) {
    return buildDragSelectionSession(input)
  }
  if (isFillHandleInput(input)) {
    return buildFillHandleSession(input)
  }
  if (isRowResizeInput(input)) {
    return buildRowResizeSession(input)
  }
  if (isColumnResizeInput(input)) {
    return buildColumnResizeSession(input)
  }

  throw new Error('Unsupported pointer input')
}

function patchInteraction(
  state: PointerInteractionState,
  input: PointerUpdateInput,
): PointerInteractionState {
  if (state.kind !== input.kind) {
    return state
  }

  if (state.kind === 'drag-selection' && input.kind === 'drag-selection') {
    const focus = copyCellCoord(input.focus)
    return {
      ...state,
      focus,
      range: normalizeCellRange(state.anchor, focus),
    }
  }

  if (state.kind === 'fill-handle' && input.kind === 'fill-handle') {
    return {
      ...state,
      focus: input.focus ? copyCellCoord(input.focus) : state.focus,
      previewRange:
        input.previewRange === undefined
          ? state.previewRange
          : input.previewRange === null
            ? null
            : copyCellRange(input.previewRange),
      direction: input.direction ?? state.direction,
      copyOnly: input.copyOnly === undefined ? state.copyOnly : input.copyOnly,
    }
  }

  if (state.kind === 'row-resize' && input.kind === 'row-resize') {
    return {
      ...state,
      previewSizePx: input.previewSizePx === undefined ? state.previewSizePx : input.previewSizePx,
    }
  }

  if (state.kind === 'column-resize' && input.kind === 'column-resize') {
    return {
      ...state,
      previewSizePx: input.previewSizePx === undefined ? state.previewSizePx : input.previewSizePx,
    }
  }

  return state
}

export function createPointerSessionState(): PointerSessionState {
  return createIdlePointerState()
}

export function startPointerSessionState(
  _state: PointerSessionState,
  input: PointerStartInput,
): PointerSessionState {
  return {
    status: 'active',
    source: input.source ?? 'pointer',
    interaction: buildInteraction(input),
    autoscroll: null,
  }
}

export function updatePointerSessionState(
  state: PointerSessionState,
  input: PointerUpdateInput,
): PointerSessionState {
  if (state.status !== 'active' || state.interaction === null) {
    return state
  }

  return {
    status: 'active',
    source: input.source ?? state.source,
    interaction: patchInteraction(state.interaction, input),
    autoscroll: patchAutoscrollState(state.autoscroll, input.autoscroll),
  }
}

function clearPointerSessionState(): PointerSessionState {
  return createIdlePointerState()
}

export function commitPointerSessionState(state: PointerSessionState): PointerSessionState {
  if (state.status !== 'active') {
    return state
  }

  return clearPointerSessionState()
}

export function cancelPointerSessionState(state: PointerSessionState): PointerSessionState {
  if (state.status === 'idle' && state.interaction === null) {
    return state
  }

  return clearPointerSessionState()
}
