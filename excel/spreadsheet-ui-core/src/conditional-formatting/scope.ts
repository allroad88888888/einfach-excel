import type { ConditionalFormatScope } from './types'
import { parseA1Cell, parseA1Range, rangeToA1 } from '../name-box/address'

/** 第一段是公式原点；保留顺序，不合并成会包含空洞的外接矩形。 */
export function conditionalFormatScopeToA1(scope: ConditionalFormatScope): string {
  return [scope.range, ...scope.additionalRanges ?? []].map(rangeToA1).join(', ')
}

export function parseConditionalFormatScope(text: string): ConditionalFormatScope | null {
  const parts = text.split(',')
  if (parts.length > 4096) return null
  const ranges = []
  for (const part of parts) {
    const cell = parseA1Cell(part.trim())
    const range = parseA1Range(part.trim()) ?? (cell
      ? { rowStart: cell.row, rowEnd: cell.row, colStart: cell.col, colEnd: cell.col } : null)
    if (!range) return null
    ranges.push(range)
  }
  return { range: ranges[0], ...(ranges.length > 1 ? { additionalRanges: ranges.slice(1) } : {}) }
}
