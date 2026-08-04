/**
 * `INDIRECT` 的引用文本解析。
 *
 * 职责：把一段 A1 或 R1C1 风格的引用文本（`INDIRECT` 的第一个实参）解析成运行
 * 期引用矩形 `RuntimeRef`。
 */
import type { CellCoord, CellRange } from '../types'
import { EXCEL_MAX_COL, EXCEL_MAX_ROW, parseA1 } from '../refs'
import type { RuntimeRef } from './runtime-ref'

export function parseIndirectReference(
  text: string,
  a1Style = true,
  base?: CellCoord,
): RuntimeRef | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined

  let sheetName: string | undefined
  let body = trimmed
  if (trimmed[0] === "'") {
    const quoted = readQuotedSheetName(trimmed)
    if (!quoted || trimmed[quoted.next] !== '!') return undefined
    sheetName = quoted.name
    body = trimmed.slice(quoted.next + 1)
  } else {
    const bang = trimmed.indexOf('!')
    if (bang >= 0) {
      sheetName = trimmed.slice(0, bang)
      if (sheetName.length === 0) return undefined
      body = trimmed.slice(bang + 1)
    }
  }
  if (body.length === 0) return undefined

  const range = parseIndirectBody(body, a1Style, base)
  return range ? { sheetName, range } : undefined
}

function parseIndirectBody(
  body: string,
  a1Style: boolean,
  base?: CellCoord,
): CellRange | undefined {
  const colon = body.indexOf(':')
  if (colon < 0) {
    const parsed = a1Style ? parseA1(body) : parseR1C1(body, base)
    if (!parsed) return undefined
    return {
      rowStart: parsed.row,
      rowEnd: parsed.row,
      colStart: parsed.col,
      colEnd: parsed.col,
    }
  }
  if (body.indexOf(':', colon + 1) >= 0) return undefined
  const parsePart = (part: string): CellCoord | null =>
    a1Style ? parseA1(part) : parseR1C1(part, base)
  const startStr = body.slice(0, colon).trim()
  const endStr = body.slice(colon + 1).trim()
  if (a1Style) {
    const wholeColumn = expandWholeColumn(startStr, endStr)
    if (wholeColumn) return wholeColumn
    const wholeRow = expandWholeRow(startStr, endStr)
    if (wholeRow) return wholeRow
  }
  const start = parsePart(startStr)
  const end = parsePart(endStr)
  if (!start || !end) return undefined
  return {
    rowStart: Math.min(start.row, end.row),
    rowEnd: Math.max(start.row, end.row),
    colStart: Math.min(start.col, end.col),
    colEnd: Math.max(start.col, end.col),
  }
}

const WHOLE_COLUMN_PART_RE = /^\$?[A-Za-z]{1,3}$/
const WHOLE_ROW_PART_RE = /^\$?\d+$/

function expandWholeColumn(startStr: string, endStr: string): CellRange | undefined {
  if (!WHOLE_COLUMN_PART_RE.test(startStr) || !WHOLE_COLUMN_PART_RE.test(endStr)) {
    return undefined
  }
  const startCol = parseA1(`${startStr}1`)
  const endCol = parseA1(`${endStr}1`)
  if (!startCol || !endCol) return undefined
  return {
    rowStart: 0,
    rowEnd: EXCEL_MAX_ROW,
    colStart: Math.min(startCol.col, endCol.col),
    colEnd: Math.max(startCol.col, endCol.col),
  }
}

function expandWholeRow(startStr: string, endStr: string): CellRange | undefined {
  if (!WHOLE_ROW_PART_RE.test(startStr) || !WHOLE_ROW_PART_RE.test(endStr)) {
    return undefined
  }
  const startRow = parseA1(`A${startStr}`)
  const endRow = parseA1(`A${endStr}`)
  if (!startRow || !endRow) return undefined
  return {
    rowStart: Math.min(startRow.row, endRow.row),
    rowEnd: Math.max(startRow.row, endRow.row),
    colStart: 0,
    colEnd: EXCEL_MAX_COL,
  }
}

function parseR1C1(text: string, base?: CellCoord): CellCoord | null {
  const match = /^R(\[[-+]?\d+\]|\d*)C(\[[-+]?\d+\]|\d*)$/i.exec(text.trim())
  if (!match) return null
  const row = resolveR1C1Axis(match[1], base?.row, EXCEL_MAX_ROW)
  const col = resolveR1C1Axis(match[2], base?.col, EXCEL_MAX_COL)
  if (row === undefined || col === undefined) return null
  return { row, col }
}

function resolveR1C1Axis(
  spec: string,
  base: number | undefined,
  max: number,
): number | undefined {
  if (spec.length === 0) return base
  if (spec[0] === '[') {
    if (base === undefined || spec[spec.length - 1] !== ']') return undefined
    const offset = Number(spec.slice(1, -1))
    if (!Number.isInteger(offset)) return undefined
    const resolved = base + offset
    return resolved < 0 || resolved > max ? undefined : resolved
  }
  const oneBased = Number(spec)
  if (!Number.isInteger(oneBased) || oneBased < 1) return undefined
  const resolved = oneBased - 1
  return resolved > max ? undefined : resolved
}

function readQuotedSheetName(
  text: string,
): { readonly name: string; readonly next: number } | undefined {
  let i = 1
  let name = ''
  while (i < text.length) {
    const ch = text[i]
    if (ch === "'") {
      if (text[i + 1] === "'") {
        name += "'"
        i += 2
        continue
      }
      return { name, next: i + 1 }
    }
    name += ch
    i += 1
  }
  return undefined
}
