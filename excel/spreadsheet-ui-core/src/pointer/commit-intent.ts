import { copyCellCoord, copyCellRange } from './pointer-coords'
import type { PointerCommitIntent, PointerSessionState } from './types'

export function createPointerCommitIntent(state: PointerSessionState): PointerCommitIntent | null {
  if (state.status !== 'active' || state.interaction === null) {
    return null
  }

  switch (state.interaction.kind) {
    case 'drag-selection':
      return {
        type: 'pointer.drag-selection.commit',
        sheetId: state.interaction.sheetId,
        source: state.source,
        anchor: copyCellCoord(state.interaction.anchor),
        focus: copyCellCoord(state.interaction.focus),
        range: copyCellRange(state.interaction.range),
        ...(state.interaction.append ? { append: true } : {}),
      }
    case 'fill-handle':
      if (state.interaction.previewRange === null) {
        return null
      }

      return {
        type: 'pointer.fill-handle.commit',
        sheetId: state.interaction.sheetId,
        source: state.source,
        sourceRange: copyCellRange(state.interaction.sourceRange),
        targetRange: copyCellRange(state.interaction.previewRange),
        focus: state.interaction.focus ? copyCellCoord(state.interaction.focus) : null,
        direction: state.interaction.direction,
        ...(state.interaction.copyOnly === true ? { copyOnly: true } : {}),
      }
    case 'row-resize':
      if (state.interaction.previewSizePx === null) {
        return null
      }

      return {
        type: 'pointer.row-resize.commit',
        sheetId: state.interaction.sheetId,
        source: state.source,
        rowIndex: state.interaction.rowIndex,
        startSizePx: state.interaction.startSizePx,
        previewSizePx: state.interaction.previewSizePx,
      }
    case 'column-resize':
      if (state.interaction.previewSizePx === null) {
        return null
      }

      return {
        type: 'pointer.column-resize.commit',
        sheetId: state.interaction.sheetId,
        source: state.source,
        colIndex: state.interaction.colIndex,
        startSizePx: state.interaction.startSizePx,
        previewSizePx: state.interaction.previewSizePx,
      }
    default:
      return null
  }
}
