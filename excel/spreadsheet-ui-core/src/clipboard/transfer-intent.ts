import type {
  ClipboardIntent,
  ClipboardOperation,
  ClipboardPayloadDescriptor,
  ClipboardPayloadInput,
  ClipboardState,
  ClipboardTargetDescriptor,
  ClipboardTransferInput,
  ClipboardTransferRequest,
} from './types'

function copyRange(range: ClipboardTargetDescriptor['range']): ClipboardTargetDescriptor['range'] {
  return {
    rowStart: range.rowStart,
    rowEnd: range.rowEnd,
    colStart: range.colStart,
    colEnd: range.colEnd,
  }
}

function rangeCellCount(range: ClipboardTargetDescriptor['range']): number {
  if (range.rowEnd < range.rowStart || range.colEnd < range.colStart) {
    return 0
  }

  return (range.rowEnd - range.rowStart + 1) * (range.colEnd - range.colStart + 1)
}

export function createClipboardState(): ClipboardState {
  return {
    status: 'idle',
    intent: null,
    source: null,
    target: null,
    payload: null,
    error: null,
  }
}

export function createClipboardPayloadDescriptor(
  input: ClipboardPayloadInput,
): ClipboardPayloadDescriptor {
  const cellCount = rangeCellCount(input.source.range)

  return {
    kind: 'range',
    source: {
      sheetId: input.source.sheetId,
      range: copyRange(input.source.range),
    },
    serialization: input.serialization ?? 'tab-separated',
    cellCount,
    estimatedBytes: input.estimatedBytes ?? cellCount * 8,
    truncated: input.truncated ?? false,
    includesFormulas: input.includesFormulas ?? false,
    includesErrors: input.includesErrors ?? false,
  }
}

export function createClipboardTransferRequest(
  operation: ClipboardOperation,
  input: ClipboardTransferInput,
): ClipboardTransferRequest {
  return {
    operation,
    source: {
      sheetId: input.source.sheetId,
      range: copyRange(input.source.range),
    },
    payload: createClipboardPayloadDescriptor(input),
    target: input.target
      ? {
          sheetId: input.target.sheetId,
          range: copyRange(input.target.range),
        }
      : null,
    revision: input.revision ?? null,
  }
}

export function createClipboardIntent(
  operation: ClipboardOperation,
  input: ClipboardTransferInput,
): ClipboardIntent {
  return {
    type: `clipboard.${operation}` as ClipboardIntent['type'],
    request: createClipboardTransferRequest(operation, input),
  }
}
