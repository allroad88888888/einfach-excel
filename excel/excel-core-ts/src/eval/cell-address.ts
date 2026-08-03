/**
 * 地址表示之间的转换。
 *
 * 职责：在 A1 文本、`CellKey`、`CellCoord` 这三种地址表示之间互转。
 */
import type { CellCoord, CellKey } from '../types'
import { cellKey, parseA1 } from '../refs'

// ----------------------------------------------------------------------------
// A1 helpers — thin shims around refs/a1 + refs/ranges for the evaluator.
//
// Kept named so worker / adapter / future-Wave code can reach a "Value
// engine-side cell coord" without re-importing `refs/`.
// ----------------------------------------------------------------------------

export function parseRefToCoord(a1: string): { row: number; col: number } | null {
  const parsed = parseA1(a1)
  if (!parsed) return null
  return { row: parsed.row, col: parsed.col }
}

export function cellCoordFromKey(key: CellKey): CellCoord | undefined {
  const sep = key.indexOf(':')
  if (sep < 0) return undefined
  const row = Number(key.slice(0, sep))
  const col = Number(key.slice(sep + 1))
  if (!Number.isInteger(row) || !Number.isInteger(col)) return undefined
  return { row, col }
}

export function parseRefToKey(a1: string): CellKey | null {
  const parsed = parseA1(a1)
  if (!parsed) return null
  return cellKey(parsed)
}
