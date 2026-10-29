import {
  formulaCodePointAt,
  formulaCodePointBefore,
  indexToColumnLabel,
  isFormulaFunctionCallHead,
  isFormulaIdentifierChar,
  isInExcelFormulaGrid,
  parseFormulaRefCoord,
  scanFormulaQuotedSegment,
} from './formula-ref-coords'

export interface FormulaRefScanToken {
  readonly row: number
  readonly col: number
  readonly start: number
  readonly end: number
  readonly qualifier?: string
  readonly qualifierSeparator?: number
}

export interface FormulaRefMapResult {
  readonly formula: string
  readonly complete: boolean
}

export interface FormulaRefScanVisitor {
  readonly visitRef?: (token: FormulaRefScanToken) => void
  readonly visitPunctuation?: (kind: ':' | '!', index: number) => void
}

interface FormulaRefQualifier {
  readonly name: string
  readonly separator: number
}

function findUnquotedFormulaRefQualifier(
  formula: string,
  referenceStart: number,
): FormulaRefQualifier | undefined {
  let separator = referenceStart - 1
  while (separator >= 0 && /\s/.test(formula[separator])) separator -= 1
  if (formula[separator] !== '!') return undefined

  let qualifierStart = separator
  while (qualifierStart > 0) {
    const previous = formulaCodePointBefore(formula, qualifierStart)
    if (!isFormulaIdentifierChar(previous)) break
    qualifierStart -= previous?.length ?? 0
  }
  if (qualifierStart === separator) return undefined

  return {
    name: formula.slice(qualifierStart, separator),
    separator,
  }
}

export function mapFormulaRefs(
  formula: string,
  mapRef: (
    row: number,
    col: number,
    anchors: { rowAbsolute: boolean; colAbsolute: boolean },
  ) => { row: number; col: number } | null,
  visitor: FormulaRefScanVisitor = {},
): FormulaRefMapResult {
  let output = ''
  let index = 0
  let pendingQualifier: FormulaRefQualifier | undefined
  const a1RefPattern = /(\$?)([A-Za-z]+)(\$?)(\d+)/y
  while (index < formula.length) {
    const char = formula[index]

    if (char === '[' || char === ']') return { formula, complete: false }

    if (char === '"' || char === "'") {
      const segmentEnd = scanFormulaQuotedSegment(formula, index, char)
      if (segmentEnd === null) return { formula, complete: false }

      if (char === "'") {
        const qualifier = formula.slice(index, segmentEnd)
        if (qualifier.includes('[') || qualifier.includes(']')) {
          return { formula, complete: false }
        }
        if (formula[segmentEnd] !== '!') return { formula, complete: false }

        const name = formula
          .slice(index + 1, segmentEnd - 1)
          .replace(/''/g, "'")
        if (name.length === 0) return { formula, complete: false }
        pendingQualifier = { name, separator: segmentEnd }
        visitor.visitPunctuation?.('!', segmentEnd)
        output += formula.slice(index, segmentEnd + 1)
        index = segmentEnd + 1
      } else {
        if (pendingQualifier) return { formula, complete: false }
        output += formula.slice(index, segmentEnd)
        index = segmentEnd
      }
      continue
    }

    if (pendingQualifier && /\s/.test(char)) {
      output += char
      index += 1
      continue
    }

    a1RefPattern.lastIndex = index
    const match = a1RefPattern.exec(formula)
    if (!match) {
      if (pendingQualifier) return { formula, complete: false }
      if (char === ':' || char === '!') {
        visitor.visitPunctuation?.(char, index)
      }
      output += char
      index += 1
      continue
    }

    const [full, colAnchor, letters, rowAnchor, digits] = match
    const tokenEnd = index + full.length
    if (
      isFormulaIdentifierChar(formulaCodePointBefore(formula, index)) ||
      isFormulaIdentifierChar(formulaCodePointAt(formula, tokenEnd)) ||
      isFormulaFunctionCallHead(formula, tokenEnd) ||
      formula[tokenEnd] === '!'
    ) {
      if (pendingQualifier) return { formula, complete: false }
      output += full
      index = tokenEnd
      continue
    }

    const coord = parseFormulaRefCoord(letters, digits)
    if (!coord || !isInExcelFormulaGrid(coord.row, coord.col)) {
      if (pendingQualifier) return { formula, complete: false }
      output += full
      index = tokenEnd
      continue
    }

    const qualifier = pendingQualifier ?? findUnquotedFormulaRefQualifier(formula, index)
    visitor.visitRef?.({
      row: coord.row,
      col: coord.col,
      start: index,
      end: tokenEnd,
      ...(qualifier
        ? {
            qualifier: qualifier.name,
            qualifierSeparator: qualifier.separator,
          }
        : {}),
    })
    pendingQualifier = undefined
    const moved = mapRef(coord.row, coord.col, {
      rowAbsolute: rowAnchor === '$',
      colAbsolute: colAnchor === '$',
    })
    if (moved === null || !isInExcelFormulaGrid(moved.row, moved.col)) {
      output += '#REF!'
      index = tokenEnd
      continue
    }

    output += `${colAnchor}${indexToColumnLabel(moved.col)}${rowAnchor}${moved.row + 1}`
    index = tokenEnd
  }
  if (pendingQualifier) return { formula, complete: false }
  return { formula: output, complete: true }
}
