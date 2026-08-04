// 一句话：视口内行高列宽与隐藏索引的投影。

import type {
  ViewportSizeProjectionRequest,
  ViewportSizeProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import type { StaticBackendState } from './state'

export function buildViewportSizeProjectionResult(
  request: ViewportSizeProjectionRequest,
  state: StaticBackendState,
): ViewportSizeProjectionResult {
  if (request.revision !== undefined && !Object.is(request.revision, state.revision)) {
    throw new Error(
      `viewport size revision conflict: expected ${String(request.revision)}, current ${String(state.revision)}`,
    )
  }
  const rowHeights = [...(state.rowHeightsBySheetId.get(request.sheetId) ?? new Map()).entries()]
    .filter(
      ([rowIndex]) => rowIndex >= request.window.rowStart && rowIndex <= request.window.rowEnd,
    )
    .map(([rowIndex, heightPx]) => ({ rowIndex, heightPx }))
    .sort((left, right) => left.rowIndex - right.rowIndex)
  const colWidths = [...(state.colWidthsBySheetId.get(request.sheetId) ?? new Map()).entries()]
    .filter(
      ([colIndex]) => colIndex >= request.window.colStart && colIndex <= request.window.colEnd,
    )
    .map(([colIndex, widthPx]) => ({ colIndex, widthPx }))
    .sort((left, right) => left.colIndex - right.colIndex)
  const hiddenRowIndices = [...(state.hiddenRowsBySheetId.get(request.sheetId) ?? new Set())]
    .filter((rowIndex) => rowIndex >= request.window.rowStart && rowIndex <= request.window.rowEnd)
    .sort((left, right) => left - right)
  const hiddenColIndices = [...(state.hiddenColsBySheetId.get(request.sheetId) ?? new Set())]
    .filter((colIndex) => colIndex >= request.window.colStart && colIndex <= request.window.colEnd)
    .sort((left, right) => left - right)

  return {
    kind: 'viewport-size',
    sheetId: request.sheetId,
    window: { ...request.window },
    requestId: request.requestId,
    revision: state.revision,
    rowHeights,
    colWidths,
    hiddenRowIndices,
    hiddenColIndices,
  }
}
