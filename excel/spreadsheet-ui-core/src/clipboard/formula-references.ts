import type { CellRange } from '../shared'
import { mapFormulaRefs, type FormulaRefScanToken } from './formula-ref-scan'

export function shiftFormulaRefs(formula: string, drow: number, dcol: number): string {
  return mapFormulaRefs(formula, (row, col, anchors) => ({
    row: anchors.rowAbsolute ? row : row + drow,
    col: anchors.colAbsolute ? col : col + dcol,
  })).formula
}

/**
 * A lexically complete ordinary A1 reference. A missing qualifier means the
 * reference is relative to the sheet containing the formula.
 */
export interface FormulaA1ReferenceRange extends CellRange {
  readonly qualifier?: string
}

export type FormulaReferenceRangeScan = readonly FormulaA1ReferenceRange[] | null

/**
 * Collect ordinary A1 dependencies with the exact lexical boundaries used
 * when shifting copied formulas. `null` means the scanner could not safely
 * classify the whole expression; callers must not infer a partial dependency
 * set.
 */
export function collectFormulaReferenceRanges(formula: string): FormulaReferenceRangeScan {
  const tokens: FormulaRefScanToken[] = []
  const colonPositions = new Set<number>()
  const bangPositions = new Set<number>()
  const scan = mapFormulaRefs(
    formula,
    (row, col) => ({ row, col }),
    {
      visitRef: (token) => tokens.push(token),
      visitPunctuation: (kind, index) => {
        if (kind === ':') colonPositions.add(index)
        else bangPositions.add(index)
      },
    },
  )
  if (!scan.complete) return null

  const references: FormulaA1ReferenceRange[] = []
  const consumedColons = new Set<number>()
  const consumedBangs = new Set<number>()
  for (let index = 0; index < tokens.length; index += 1) {
    const start = tokens[index]
    const end = tokens[index + 1]
    const separator = end ? formula.slice(start.end, end.start) : ''
    if (end && /^\s*:\s*$/.test(separator)) {
      if (!start.qualifier && end.qualifier) return null
      if (
        start.qualifier &&
        end.qualifier &&
        start.qualifier !== end.qualifier
      ) {
        return null
      }

      const colonPosition = start.end + separator.indexOf(':')
      consumedColons.add(colonPosition)
      if (start.qualifierSeparator !== undefined) {
        consumedBangs.add(start.qualifierSeparator)
      }
      if (end.qualifierSeparator !== undefined) {
        consumedBangs.add(end.qualifierSeparator)
      }
      references.push({
        ...(start.qualifier ? { qualifier: start.qualifier } : {}),
        rowStart: Math.min(start.row, end.row),
        rowEnd: Math.max(start.row, end.row),
        colStart: Math.min(start.col, end.col),
        colEnd: Math.max(start.col, end.col),
      })
      index += 1
      continue
    }

    if (start.qualifierSeparator !== undefined) {
      consumedBangs.add(start.qualifierSeparator)
    }
    references.push({
      ...(start.qualifier ? { qualifier: start.qualifier } : {}),
      rowStart: start.row,
      rowEnd: start.row,
      colStart: start.col,
      colEnd: start.col,
    })
  }

  for (const position of colonPositions) {
    if (!consumedColons.has(position)) return null
  }
  for (const position of bangPositions) {
    if (!consumedBangs.has(position)) return null
  }

  return references
}
