import type { CellRange } from '@einfach/spreadsheet-ui-core'

function columnLabel(index: number): string {
  let value = index + 1
  let label = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    value = Math.floor((value - 1) / 26)
  }
  return label
}

export function dataValidationRangeLabel(
  range: CellRange | undefined,
  noRangeLabel: string,
): string {
  if (!range) return noRangeLabel
  const topLeft = `${columnLabel(range.colStart)}${range.rowStart + 1}`
  const bottomRight = `${columnLabel(range.colEnd)}${range.rowEnd + 1}`
  return topLeft === bottomRight ? topLeft : `${topLeft}:${bottomRight}`
}
