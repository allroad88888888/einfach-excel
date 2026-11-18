import type { SpreadsheetBorders, SpreadsheetBorderSpec } from '../contracts'
import { BORDER_SIDES, BORDER_STYLES } from './constants'

/** Preserve projected diagonal facts without making them editable conditional-rule fields. */
export function snapshotCellBorders(value: unknown): SpreadsheetBorders | null {
  if (typeof value !== 'object' || value === null) return null
  try {
    const input = value as Record<string, unknown>
    const result: SpreadsheetBorders = {}
    for (const side of [...BORDER_SIDES, 'diagUp', 'diagDown'] as const) {
      const entry = input[side]
      if (entry === undefined) continue
      if (typeof entry !== 'object' || entry === null) return null
      const { style, color } = entry as Partial<SpreadsheetBorderSpec>
      if (!style || !(BORDER_STYLES as readonly string[]).includes(style)) return null
      if (color !== undefined && (typeof color !== 'string'
        || ((side === 'diagUp' || side === 'diagDown') && !/^#[\da-f]{6}$/i.test(color))))
        return null
      result[side] = { style, ...(color === undefined ? {} : { color }) }
    }
    const { diagUp: up, diagDown: down } = result
    if (up && down && up.style !== 'none' && down.style !== 'none'
      && (up.style !== down.style
        || (up.color ?? '#000000').toLowerCase() !== (down.color ?? '#000000').toLowerCase()))
      return null
    return result
  } catch { return null }
}
