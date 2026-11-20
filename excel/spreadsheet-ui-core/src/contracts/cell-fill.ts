export const CELL_FILL_PATTERNS = [
  'mediumGray', 'darkGray', 'lightGray',
  'darkHorizontal', 'darkVertical', 'darkDown', 'darkUp', 'darkGrid', 'darkTrellis',
  'lightHorizontal', 'lightVertical', 'lightDown', 'lightUp', 'lightGrid', 'lightTrellis',
  'gray125', 'gray0625',
] as const

export type SpreadsheetFillPattern = typeof CELL_FILL_PATTERNS[number]

/** Background is the existing bgColor field, never a second copy inside this descriptor. */
export interface SpreadsheetPatternFill {
  readonly kind: 'pattern'
  readonly pattern: SpreadsheetFillPattern
  readonly foreground: string
}

export interface SpreadsheetGradientStop {
  readonly position: number
  readonly color: string
}

export interface SpreadsheetLinearGradientFill {
  readonly kind: 'linear-gradient'
  readonly degree: number
  readonly stops: readonly SpreadsheetGradientStop[]
}

export interface SpreadsheetPathGradientFill {
  readonly kind: 'path-gradient'
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
  readonly stops: readonly SpreadsheetGradientStop[]
}

export type SpreadsheetGradientFill = SpreadsheetLinearGradientFill | SpreadsheetPathGradientFill
export type SpreadsheetCellFill = SpreadsheetPatternFill | SpreadsheetGradientFill
export const MAX_GRADIENT_STOPS = 256

const rgb = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const fraction = (value: unknown): value is number => finite(value) && value >= 0 && value <= 1

export function snapshotCellFill(value: unknown): SpreadsheetCellFill | null {
  if (typeof value !== 'object' || value === null) return null
  try {
    const fill = value as Record<string, unknown>
    if (fill.kind === 'pattern') {
      if (Object.keys(fill).some(key => !['kind', 'pattern', 'foreground'].includes(key))
        || !CELL_FILL_PATTERNS.includes(fill.pattern as SpreadsheetFillPattern)
        || !rgb(fill.foreground))
        return null
      return { kind: 'pattern', pattern: fill.pattern as SpreadsheetFillPattern,
        foreground: fill.foreground }
    }
    const fields = fill.kind === 'linear-gradient' ? ['degree']
      : fill.kind === 'path-gradient' ? ['left', 'right', 'top', 'bottom'] : null
    if (!fields || Object.keys(fill).some(key => !['kind', 'stops', ...fields].includes(key))) return null
    if (!fields.every(key => (fill.kind === 'linear-gradient' ? finite : fraction)(fill[key]))) return null
    if (!Array.isArray(fill.stops) || fill.stops.length > MAX_GRADIENT_STOPS) return null
    const stops: SpreadsheetGradientStop[] = []
    for (const stop of fill.stops) {
      if (!stop || typeof stop !== 'object'
        || Object.keys(stop).some(key => key !== 'position' && key !== 'color')
        || !fraction(stop.position) || !rgb(stop.color)) return null
      stops.push({ position: stop.position, color: stop.color })
    }
    return fill.kind === 'linear-gradient'
      ? { kind: fill.kind, degree: fill.degree as number, stops }
      : { kind: 'path-gradient', left: fill.left as number, right: fill.right as number,
          top: fill.top as number, bottom: fill.bottom as number, stops }
  } catch { return null }
}

export function cloneCellFill(fill: SpreadsheetCellFill): SpreadsheetCellFill {
  return fill.kind === 'pattern' ? { ...fill } : { ...fill, stops: fill.stops.map(stop => ({ ...stop })) }
}

export function freezeCellFill(fill: SpreadsheetCellFill): SpreadsheetCellFill {
  return Object.freeze(fill.kind === 'pattern' ? { ...fill } : {
    ...fill, stops: Object.freeze(fill.stops.map(stop => Object.freeze({ ...stop }))),
  })
}
