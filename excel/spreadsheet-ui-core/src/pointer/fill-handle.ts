import { normalizeRange } from './pointer-coords'
import type { CellCoord, CellRange } from '../shared'
import type { PointerFillDirection } from './types'

export interface FillHandlePreview {
  previewRange: CellRange
  direction: PointerFillDirection | null
}

export function createFillHandlePreview(
  sourceRange: CellRange,
  focus: CellCoord,
): FillHandlePreview {
  const source = normalizeRange(sourceRange)
  const upDistance = focus.row < source.rowStart ? source.rowStart - focus.row : 0
  const downDistance = focus.row > source.rowEnd ? focus.row - source.rowEnd : 0
  const leftDistance = focus.col < source.colStart ? source.colStart - focus.col : 0
  const rightDistance = focus.col > source.colEnd ? focus.col - source.colEnd : 0
  const verticalDistance = Math.max(upDistance, downDistance)
  const horizontalDistance = Math.max(leftDistance, rightDistance)

  if (verticalDistance === 0 && horizontalDistance === 0) {
    return {
      previewRange: source,
      direction: null,
    }
  }

  if (verticalDistance >= horizontalDistance) {
    if (upDistance > 0) {
      return {
        previewRange: {
          rowStart: focus.row,
          rowEnd: source.rowEnd,
          colStart: source.colStart,
          colEnd: source.colEnd,
        },
        direction: 'up',
      }
    }

    return {
      previewRange: {
        rowStart: source.rowStart,
        rowEnd: focus.row,
        colStart: source.colStart,
        colEnd: source.colEnd,
      },
      direction: 'down',
    }
  }

  if (leftDistance > 0) {
    return {
      previewRange: {
        rowStart: source.rowStart,
        rowEnd: source.rowEnd,
        colStart: focus.col,
        colEnd: source.colEnd,
      },
      direction: 'left',
    }
  }

  return {
    previewRange: {
      rowStart: source.rowStart,
      rowEnd: source.rowEnd,
      colStart: source.colStart,
      colEnd: focus.col,
    },
    direction: 'right',
  }
}

export function getFillHandleWriteRange(
  sourceRange: CellRange,
  targetRange: CellRange,
  direction: PointerFillDirection | null,
): CellRange | null {
  if (direction === null) {
    return null
  }

  const source = normalizeRange(sourceRange)
  const target = normalizeRange(targetRange)

  switch (direction) {
    case 'down':
      return target.rowEnd > source.rowEnd
        ? {
            rowStart: source.rowEnd + 1,
            rowEnd: target.rowEnd,
            colStart: source.colStart,
            colEnd: source.colEnd,
          }
        : null
    case 'up':
      return target.rowStart < source.rowStart
        ? {
            rowStart: target.rowStart,
            rowEnd: source.rowStart - 1,
            colStart: source.colStart,
            colEnd: source.colEnd,
          }
        : null
    case 'right':
      return target.colEnd > source.colEnd
        ? {
            rowStart: source.rowStart,
            rowEnd: source.rowEnd,
            colStart: source.colEnd + 1,
            colEnd: target.colEnd,
          }
        : null
    case 'left':
      return target.colStart < source.colStart
        ? {
            rowStart: source.rowStart,
            rowEnd: source.rowEnd,
            colStart: target.colStart,
            colEnd: source.colStart - 1,
          }
        : null
    default:
      return null
  }
}

export function getFillHandleSourceCoord(sourceRange: CellRange, target: CellCoord): CellCoord {
  const source = normalizeRange(sourceRange)
  const height = source.rowEnd - source.rowStart + 1
  const width = source.colEnd - source.colStart + 1
  const rowOffset = positiveModulo(target.row - source.rowStart, height)
  const colOffset = positiveModulo(target.col - source.colStart, width)

  return {
    row: source.rowStart + rowOffset,
    col: source.colStart + colOffset,
  }
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}
