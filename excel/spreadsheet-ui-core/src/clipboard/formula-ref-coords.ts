import type { CellCoord } from '../shared'

const EXCEL_MAX_FORMULA_ROW_INDEX = 1_048_575
const EXCEL_MAX_FORMULA_COL_INDEX = 16_383

function columnLabelToIndex(letters: string): number {
  if (letters.length === 0) return -1
  let col = 0
  for (let index = 0; index < letters.length; index += 1) {
    const code = letters.toUpperCase().charCodeAt(index) - 64
    if (code < 1 || code > 26) return -1
    col = col * 26 + code
  }
  return col - 1
}

export function indexToColumnLabel(col: number): string {
  let current = col
  let label = ''

  do {
    label = String.fromCharCode(65 + (current % 26)) + label
    current = Math.floor(current / 26) - 1
  } while (current >= 0)

  return label
}

export function parseFormulaRefCoord(
  letters: string,
  digits: string,
): { row: number; col: number } | null {
  const col = columnLabelToIndex(letters)
  const row = Number(digits) - 1
  if (col < 0 || !Number.isInteger(row) || row < 0) return null
  return { row, col }
}

export function parseA1Coord(addr: string): CellCoord | null {
  const match = /^\s*([A-Za-z]+)(\d+)\s*$/.exec(addr)
  if (!match) return null
  return parseFormulaRefCoord(match[1], match[2])
}

const FORMULA_IDENTIFIER_CHAR_PATTERN = /[\p{L}\p{M}\p{N}\p{Pc}.\\$\u200C\u200D]/u

export function formulaCodePointAt(value: string, index: number): string | undefined {
  const codePoint = value.codePointAt(index)
  return codePoint === undefined ? undefined : String.fromCodePoint(codePoint)
}

export function formulaCodePointBefore(value: string, index: number): string | undefined {
  if (index <= 0) return undefined

  const previous = value.charCodeAt(index - 1)
  if (previous >= 0xdc00 && previous <= 0xdfff && index >= 2) {
    const leading = value.charCodeAt(index - 2)
    if (leading >= 0xd800 && leading <= 0xdbff) {
      return value.slice(index - 2, index)
    }
  }
  return value[index - 1]
}

export function isFormulaIdentifierChar(char: string | undefined): boolean {
  return char !== undefined && FORMULA_IDENTIFIER_CHAR_PATTERN.test(char)
}

export function isFormulaFunctionCallHead(formula: string, tokenEnd: number): boolean {
  let next = tokenEnd
  while (next < formula.length && /\s/.test(formula[next])) next += 1
  return formula[next] === '('
}

export function scanFormulaQuotedSegment(formula: string, start: number, quote: '"' | "'"): number | null {
  let index = start + 1
  while (index < formula.length) {
    if (formula[index] !== quote) {
      index += 1
      continue
    }
    if (formula[index + 1] === quote) {
      index += 2
      continue
    }
    return index + 1
  }
  return null
}

export function isInExcelFormulaGrid(row: number, col: number): boolean {
  return (
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    col >= 0 &&
    row <= EXCEL_MAX_FORMULA_ROW_INDEX &&
    col <= EXCEL_MAX_FORMULA_COL_INDEX
  )
}
