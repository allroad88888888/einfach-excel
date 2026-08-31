import type { RangeRef } from './types'
function columnLabelToIndex(label: string): number {
  let result = 0
  for (let i = 0; i < label.length; i += 1) {
    result = result * 26 + (label.charCodeAt(i) - 64)
  }
  return result - 1
}

/**
 * Parse an A1 cell reference. Deliberately NOT grid-bounded: the engine's
 * formula parser also accepts an A1-shaped token past `XFD` and reads it as an
 * (always empty) off-grid cell. That is what makes a bare `Table1` — column
 * `TABLE`, row 1 — evaluate to an empty cell rather than a structured
 * reference or `#NAME?` in BOTH engines. Verified against WASM in
 * vnext-table-totals-static-wasm-parity.test.ts.
 */
function parseCellRef(token: string): { row: number; col: number } | null {
  const stripped = token.replace(/\$/g, '')
  const match = /^([A-Z]+)(\d+)$/.exec(stripped)
  if (!match) return null
  const col = columnLabelToIndex(match[1])
  const row = Number(match[2]) - 1
  if (!Number.isInteger(row) || row < 0 || col < 0) return null
  return { row, col }
}

function parseRangeRef(token: string): RangeRef | null {
  const [a, b] = token.split(':')
  if (!a || !b) return null
  const start = parseCellRef(a)
  const end = parseCellRef(b)
  if (!start || !end) return null
  return {
    rowStart: Math.min(start.row, end.row),
    rowEnd: Math.max(start.row, end.row),
    colStart: Math.min(start.col, end.col),
    colEnd: Math.max(start.col, end.col),
  }
}

export { parseCellRef, parseRangeRef }
