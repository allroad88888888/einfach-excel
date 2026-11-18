export const CELL_FILL_PATTERNS = [
  'mediumGray', 'darkGray', 'lightGray',
  'darkHorizontal', 'darkVertical', 'darkDown', 'darkUp', 'darkGrid', 'darkTrellis',
  'lightHorizontal', 'lightVertical', 'lightDown', 'lightUp', 'lightGrid', 'lightTrellis',
  'gray125', 'gray0625',
] as const

export type SpreadsheetFillPattern = typeof CELL_FILL_PATTERNS[number]

/** Background is the existing bgColor field, never a second copy inside this descriptor. */
export interface SpreadsheetCellFill {
  readonly kind: 'pattern'
  readonly pattern: SpreadsheetFillPattern
  readonly foreground: string
}

export function snapshotCellFill(value: unknown): SpreadsheetCellFill | null {
  if (typeof value !== 'object' || value === null) return null
  try {
    if (Object.keys(value).some(key => !['kind', 'pattern', 'foreground'].includes(key))) return null
    const fill = value as Partial<SpreadsheetCellFill>
    if (fill.kind !== 'pattern' || !CELL_FILL_PATTERNS.includes(fill.pattern!)
      || typeof fill.foreground !== 'string' || !/^#[\da-f]{6}$/i.test(fill.foreground))
      return null
    return { kind: 'pattern', pattern: fill.pattern!, foreground: fill.foreground }
  } catch { return null }
}
