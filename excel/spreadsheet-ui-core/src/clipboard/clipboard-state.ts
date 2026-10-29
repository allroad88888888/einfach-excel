import { createClipboardIntent, createClipboardState } from './transfer-intent'
import type { ClipboardState, ClipboardTransferInput } from './types'

export function copyClipboardState(
  state: ClipboardState,
  input: ClipboardTransferInput,
): ClipboardState {
  const intent = createClipboardIntent('copy', input)
  return {
    status: 'copying',
    intent,
    source: intent.request.source,
    target: intent.request.target,
    payload: intent.request.payload,
    error: null,
  }
}

export function cutClipboardState(
  state: ClipboardState,
  input: ClipboardTransferInput,
): ClipboardState {
  const intent = createClipboardIntent('cut', input)
  return {
    status: 'cutting',
    intent,
    source: intent.request.source,
    target: intent.request.target,
    payload: intent.request.payload,
    error: null,
  }
}

export function pasteClipboardState(
  state: ClipboardState,
  input: ClipboardTransferInput,
): ClipboardState {
  const intent = createClipboardIntent('paste', input)
  return {
    status: 'pasting',
    intent,
    source: intent.request.source,
    target: intent.request.target,
    payload: intent.request.payload,
    error: null,
  }
}

export function markClipboardReadyState(state: ClipboardState): ClipboardState {
  if (state.payload === null) {
    return state
  }

  return {
    ...state,
    status: 'ready',
  }
}

export function setClipboardErrorState(
  state: ClipboardState,
  error: ClipboardState['error'],
): ClipboardState {
  return {
    ...state,
    status: error === null ? 'idle' : 'error',
    error,
  }
}

export function clearClipboardState(): ClipboardState {
  return createClipboardState()
}
