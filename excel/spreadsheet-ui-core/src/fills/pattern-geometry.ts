import { CELL_FILL_PATTERNS, type SpreadsheetFillPattern } from '../contracts/cell-fill'

export const CELL_PATTERN_TILE_SIZE = 8
export type PatternRectangle = readonly [x: number, y: number, width: number, height: number]

/** Fixed logical-pixel tiles; patterns keep their phase at the complete cell's top-left corner. */
function marked(pattern: SpreadsheetFillPattern, x: number, y: number): boolean {
  switch (pattern) {
    case 'mediumGray': return (x + y) % 2 === 0
    case 'darkGray': return x % 2 !== 0 || y % 2 !== 0
    case 'lightGray': return x % 2 === 0 && y % 2 === 0
    case 'darkHorizontal': return y % 4 < 2
    case 'darkVertical': return x % 4 < 2
    case 'darkDown': return (x - y + 8) % 4 < 2
    case 'darkUp': return (x + y) % 4 < 2
    case 'darkGrid': return x % 4 === 0 || y % 4 === 0
    case 'darkTrellis': return (x - y + 8) % 4 === 0 || (x + y) % 4 === 0
    case 'lightHorizontal': return y === 0
    case 'lightVertical': return x === 0
    case 'lightDown': return (x - y + 8) % 8 === 0
    case 'lightUp': return (x + y) % 8 === 0
    case 'lightGrid': return x === 0 || y === 0
    case 'lightTrellis': return (x - y + 8) % 8 === 0 || (x + y) % 8 === 0
    case 'gray125': return x % 4 === 0 && y % 2 === 0
    case 'gray0625': return x % 4 === 0 && y % 4 === 0
  }
}

const tiles = new Map(CELL_FILL_PATTERNS.map(pattern => {
  const rectangles: PatternRectangle[] = []
  for (let y = 0; y < CELL_PATTERN_TILE_SIZE; y++) {
    for (let x = 0; x < CELL_PATTERN_TILE_SIZE; x++) {
      if (!marked(pattern, x, y)) continue
      const start = x
      while (x + 1 < CELL_PATTERN_TILE_SIZE && marked(pattern, x + 1, y)) x++
      rectangles.push(Object.freeze([start, y, x - start + 1, 1] as const))
    }
  }
  return [pattern, Object.freeze(rectangles)] as const
}))

export function patternFillRectangles(
  pattern: SpreadsheetFillPattern,
): readonly PatternRectangle[] {
  return tiles.get(pattern) ?? []
}
