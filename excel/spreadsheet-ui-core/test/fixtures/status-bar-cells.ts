import type { DisplayCell } from '../../src/backend'

/** DisplayCell 构造器，供 status-bar 各测试文件共用。 */

export function numericCell(row: number, col: number, value: number): DisplayCell {
  return {
    row,
    col,
    displayValue: String(value),
    valueKind: 'number',
    numericValue: value,
  }
}

export function stringCell(row: number, col: number, value: string): DisplayCell {
  return { row, col, displayValue: value, valueKind: 'string' }
}

export function blankCell(row: number, col: number): DisplayCell {
  return { row, col, displayValue: '', valueKind: 'blank' }
}
