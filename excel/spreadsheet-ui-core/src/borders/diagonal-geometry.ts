import type { SpreadsheetBorders, SpreadsheetDiagonalSide } from '../contracts/cell-format'

export interface DiagonalBorderLine {
  readonly side: SpreadsheetDiagonalSide
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly width: number
  readonly color: string
  readonly dash: readonly number[]
}

/** Full logical-cell coordinates; callers clip after deriving the paths, including double lines. */
export function diagonalBorderLines(
  borders: SpreadsheetBorders | undefined, width: number, height: number,
): readonly DiagonalBorderLine[] {
  if (!borders || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    return []
  const lines: DiagonalBorderLine[] = []
  for (const side of ['diagDown', 'diagUp'] as const) {
    const spec = borders[side]
    if (!spec || spec.style === 'none') continue
    const dy = side === 'diagDown' ? height : -height
    const y1 = side === 'diagDown' ? 0 : height
    const length = Math.hypot(width, height)
    for (const offset of spec.style === 'double' ? [-1, 1] : [0]) {
      const dx = offset ? -dy / length * offset : 0, oy = width / length * offset
      lines.push({ side, x1: dx, y1: y1 + oy, x2: width + dx, y2: y1 + dy + oy,
        width: spec.style === 'thick' ? 3 : spec.style === 'medium' ? 2 : 1,
        color: spec.color ?? '#000000',
        dash: spec.style === 'dashed' ? [4, 3] : spec.style === 'dotted' ? [1, 2] : [],
      })
    }
  }
  return lines
}
