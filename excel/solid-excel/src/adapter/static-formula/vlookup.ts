import type { RangeRef } from './types'
import type { Value } from './value'
import { isErr } from './value'
function applyVlookup(
  args: Array<Value | RangeRef>,
  resolve: (row: number, col: number) => Value,
): Value {
  const target = args[0]
  const table = args[1]
  const colIndexArg = args[2]
  if (target === undefined || colIndexArg === undefined) return '#VALUE!'
  if (typeof target === 'object') return '#VALUE!'
  if (isErr(target)) return target
  if (typeof table !== 'object') return '#VALUE!'
  if (typeof colIndexArg !== 'number') {
    if (typeof colIndexArg === 'string' && colIndexArg.startsWith('#')) return colIndexArg
    return '#VALUE!'
  }
  // Excel VLOOKUP col_index is 1-based.
  const colOffset = Math.trunc(colIndexArg) - 1
  if (colOffset < 0) return '#VALUE!'
  const tableWidth = table.colEnd - table.colStart + 1
  if (colOffset >= tableWidth) return '#REF!'
  // range_lookup defaults to TRUE in Excel; we only support FALSE (exact)
  // semantics for now — TRUE-mode approximate match needs sorted data and
  // isn't worth the complexity for the demo. Treat any 4th arg as exact.
  for (let row = table.rowStart; row <= table.rowEnd; row += 1) {
    const candidate = resolve(row, table.colStart)
    if (isErr(candidate)) return candidate
    if (typeof candidate === typeof target && candidate === target) {
      const found = resolve(row, table.colStart + colOffset)
      if (isErr(found)) return found
      return found
    }
    // Excel-style case-insensitive string match.
    if (
      typeof candidate === 'string' &&
      typeof target === 'string' &&
      candidate.toLowerCase() === target.toLowerCase()
    ) {
      const found = resolve(row, table.colStart + colOffset)
      if (isErr(found)) return found
      return found
    }
  }
  return '#N/A'
}

export { applyVlookup }
