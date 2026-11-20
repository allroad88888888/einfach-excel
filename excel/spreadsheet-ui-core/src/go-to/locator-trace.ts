import { parseA1Cell, parseA1Range } from '../name-box/address'
import type { CellCoord, CellRange } from '../shared'
import { keyOf, packMatches } from './match-packing'
import type { GoToScanContext, GoToScanResult } from './types'

function canonicalRuleSignature(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalRuleSignature).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalRuleSignature(v)}`).join(',')}}`
}

export function sameRulePayload(left: unknown, right: unknown): boolean {
  if (left == null || right == null) return false
  return canonicalRuleSignature(left) === canonicalRuleSignature(right)
}

function stripFormulaStrings(formula: string): string {
  let out = ''
  let inQuotes = false
  for (let i = 0; i < formula.length; i += 1) {
    const ch = formula[i]!
    if (ch === '"') {
      if (inQuotes && formula[i + 1] === '"') {
        i += 1
        continue
      }
      inQuotes = !inQuotes
      out += ' '
      continue
    }
    out += inQuotes ? ' ' : ch
  }
  return out
}

/** 提取同表 A1 单格或矩形引用（排除带 `!` 的跨表前缀与引号文本）。 */
export function extractSameSheetRefs(formula: string): CellRange[] {
  const cleaned = stripFormulaStrings(formula.startsWith('=') ? formula.slice(1) : formula)
    .replace(/(?:'(?:[^']|'')*'|[A-Za-z0-9_.]+)\s*!\s*\$?[A-Za-z]{1,3}\$?\d+(?:\s*:\s*\$?[A-Za-z]{1,3}\$?\d+)?/g, ' ')
  const pattern = /(?<![A-Za-z0-9_!'])\$?([A-Za-z]{1,3})\$?([1-9]\d*)(?:\s*:\s*\$?([A-Za-z]{1,3})\$?([1-9]\d*))?(?![A-Za-z0-9_(])/g
  const ranges: CellRange[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(cleaned)) !== null) {
    const token = match[3] ? `${match[1]}${match[2]}:${match[3]}${match[4]}` : `${match[1]}${match[2]}`
    const range = parseA1Range(token)
    if (range) {
      ranges.push(range)
      continue
    }
    const cell = parseA1Cell(token)
    if (cell) {
      ranges.push({ rowStart: cell.row, rowEnd: cell.row, colStart: cell.col, colEnd: cell.col })
    }
  }
  return ranges
}

function expandRangeCoords(range: CellRange, out: CellCoord[], seen: Set<string>): void {
  for (let r = range.rowStart; r <= range.rowEnd; r += 1) {
    for (let c = range.colStart; c <= range.colEnd; c += 1) {
      const k = keyOf(r, c)
      if (!seen.has(k)) {
        seen.add(k)
        out.push({ row: r, col: c })
      }
    }
  }
}

export function scanFormulaGraph(
  kind: 'precedents' | 'precedents-all' | 'dependents' | 'dependents-all',
  context: GoToScanContext,
): GoToScanResult {
  const allLevels = kind === 'precedents-all' || kind === 'dependents-all'
  const formulasByKey = new Map<string, { coord: CellCoord; refs: CellRange[] }>()
  for (const cell of context.cells) {
    if (cell.formula) {
      formulasByKey.set(keyOf(cell.row, cell.col), {
        coord: { row: cell.row, col: cell.col },
        refs: extractSameSheetRefs(cell.formula),
      })
    }
  }
  const startKey = keyOf(context.activeCell.row, context.activeCell.col)
  const matched: CellCoord[] = []
  const matchedKeys = new Set<string>()

  if (kind === 'precedents' || kind === 'precedents-all') {
    const visited = new Set<string>([startKey])
    const queue: CellCoord[] = [context.activeCell]
    while (queue.length > 0) {
      const cur = queue.shift()!
      const entry = formulasByKey.get(keyOf(cur.row, cur.col))
      if (!entry) continue
      for (const ref of entry.refs) {
        const beforeLen = matched.length
        expandRangeCoords(ref, matched, matchedKeys)
        if (allLevels) {
          for (let i = beforeLen; i < matched.length; i += 1) {
            const next = matched[i]!
            const nk = keyOf(next.row, next.col)
            if (!visited.has(nk) && formulasByKey.has(nk)) {
              visited.add(nk)
              queue.push(next)
            }
          }
        }
      }
    }
    return packMatches(context.sheetId, matched)
  }

  const visited = new Set<string>([startKey])
  const queue: CellCoord[] = [context.activeCell]
  const entries = [...formulasByKey.values()]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const entry of entries) {
      const ek = keyOf(entry.coord.row, entry.coord.col)
      if (visited.has(ek)) continue
      const referencesTarget = entry.refs.some(
        (r) =>
          cur.row >= r.rowStart &&
          cur.row <= r.rowEnd &&
          cur.col >= r.colStart &&
          cur.col <= r.colEnd,
      )
      if (referencesTarget) {
        visited.add(ek)
        if (!matchedKeys.has(ek)) {
          matchedKeys.add(ek)
          matched.push(entry.coord)
        }
        if (allLevels) queue.push(entry.coord)
      }
    }
  }
  return packMatches(context.sheetId, matched)
}
