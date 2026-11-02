import type { CellRange } from '../shared'

export interface FormulaReferenceSheetIdentity {
  readonly id: string
  readonly name: string
}

export interface FormulaReferenceToken {
  /** Char offset (inclusive) into the draft where this token starts. */
  start: number
  /** Char offset (exclusive) into the draft where this token ends. */
  end: number
  /** Verbatim token text from the draft (e.g. 'B2', 'Sheet2!A1:C3'). */
  text: string
  /** Sheet id this token refers to, or null when no explicit prefix is present. */
  sheetId: string | null
  /** For 3D references (e.g. Sheet1:Sheet3!A1:B2), all sheet ids in the inclusive span. */
  sheetIds?: readonly string[]
  /** Resolved 0-based range. Single-cell tokens use rowStart=rowEnd, colStart=colEnd. */
  range: CellRange
  /** Stable color slot, assigned in document order. Hosts can map to a palette. */
  colorIndex: number
}

const COLUMN_LABEL_RE = /[A-Z]+/i

function columnLabelToIndex(label: string): number {
  let result = 0
  for (let i = 0; i < label.length; i += 1) {
    result = result * 26 + (label.charCodeAt(i) - 64)
  }
  return result - 1
}

function parseA1(token: string): { row: number; col: number } | null {
  const colMatch = COLUMN_LABEL_RE.exec(token)
  if (!colMatch || colMatch.index !== 0) return null
  const colPart = colMatch[0]
  const rowPart = token.slice(colPart.length)
  if (rowPart.length === 0) return null
  const rowOneBased = Number(rowPart)
  if (!Number.isInteger(rowOneBased) || rowOneBased < 1) return null
  const col = columnLabelToIndex(colPart.toUpperCase())
  if (col < 0 || col >= 16_384 || rowOneBased > 1_048_576) return null
  return { row: rowOneBased - 1, col }
}

const SHEET_IDENT_PART = '([A-Za-z_][\\w.]*)|\'((?:[^\']|\'\')+)\''
const SHEET_PREFIX_PART = `(?:(?:${SHEET_IDENT_PART})(?::(?:${SHEET_IDENT_PART}))?!)`
const CELL_COORD_PART = '(\\$?[A-Z]+\\$?\\d+)'
const TOKEN_RE = new RegExp(
  `"(?:[^"]|"")*"?|${SHEET_PREFIX_PART}?${CELL_COORD_PART}(?::${CELL_COORD_PART})?`,
  'gi',
)

function findSheetIndex(
  rawSheet: string,
  sheets: readonly FormulaReferenceSheetIdentity[],
): number {
  const normalized = rawSheet.toLowerCase()
  return sheets.findIndex(
    (sheet) =>
      sheet.id === rawSheet ||
      sheet.name.toLowerCase() === normalized ||
      sheet.id.toLowerCase() === normalized,
  )
}

function resolveFormulaReferenceSheetId(
  rawSheet: string | undefined,
  currentSheetId: string | null,
  sheets?: readonly FormulaReferenceSheetIdentity[],
): string | null {
  if (rawSheet !== undefined) {
    if (sheets && sheets.length > 0) {
      const idx = findSheetIndex(rawSheet, sheets)
      return idx >= 0 ? sheets[idx].id : rawSheet
    }
    return rawSheet
  }
  if (currentSheetId !== null && sheets && sheets.length > 0) {
    const idx = findSheetIndex(currentSheetId, sheets)
    return idx >= 0 ? sheets[idx].id : currentSheetId
  }
  return currentSheetId
}

function splitQuoted3DSpan(rawSheet: string): [string, string] | null {
  const parts = rawSheet.split(':')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return [parts[0], parts[1]]
}

function resolveFormulaReference3DSpan(
  startSheet: string,
  endSheet: string,
  currentSheetId: string | null,
  sheets?: readonly FormulaReferenceSheetIdentity[],
): { sheetId: string | null; sheetIds: readonly string[]; spanKey: string } {
  const resolvedCurrent = resolveFormulaReferenceSheetId(undefined, currentSheetId, sheets)
  if (sheets && sheets.length > 0) {
    const idxA = findSheetIndex(startSheet, sheets)
    const idxB = findSheetIndex(endSheet, sheets)
    if (idxA >= 0 && idxB >= 0) {
      const low = Math.min(idxA, idxB)
      const high = Math.max(idxA, idxB)
      const sheetIds = sheets.slice(low, high + 1).map((sheet) => sheet.id)
      const sheetId =
        resolvedCurrent !== null && sheetIds.includes(resolvedCurrent)
          ? resolvedCurrent
          : (sheetIds[0] ?? `${startSheet}:${endSheet}`)
      return { sheetId, sheetIds, spanKey: `3d:${sheetIds.join(':')}` }
    }
  }
  const sheetIds =
    startSheet.toLowerCase() === endSheet.toLowerCase() ? [startSheet] : [startSheet, endSheet]
  const matchesCurrent =
    resolvedCurrent !== null &&
    sheetIds.some((name) => name.toLowerCase() === resolvedCurrent.toLowerCase())
  const sheetId = matchesCurrent ? resolvedCurrent : `${startSheet}:${endSheet}`
  return {
    sheetId,
    sheetIds,
    spanKey: `3d:${startSheet.toLowerCase()}:${endSheet.toLowerCase()}`,
  }
}

/**
 * Scan a formula draft (without the leading '=') and return every cell /
 * range reference token in left-to-right order. The function is purely
 * lexical; it does not validate that referenced cells actually exist.
 *
 * - `currentSheetId` is used to fill `sheetId` for tokens with no explicit
 *   sheet prefix.
 * - `sheets` optionally maps explicit sheet-name prefixes (case-insensitively)
 *   to their canonical `sheet.id` so same-sheet qualified and unqualified
 *   references deduplicate to the same `colorIndex`.
 * - The draft may include or omit the leading '='; the parser scans the
 *   entire string in either case.
 * - Tokens are deduplicated by their resolved range key; the `colorIndex`
 *   stays stable across duplicates (so highlighting the same cell twice in
 *   the formula gets the same color).
 */
export function parseFormulaReferences(
  draft: string,
  currentSheetId: string | null,
  sheets?: readonly FormulaReferenceSheetIdentity[],
): FormulaReferenceToken[] {
  const tokens: FormulaReferenceToken[] = []
  if (!draft) return tokens

  // Skip the leading '=' so positions report against the full draft.
  const colorByKey = new Map<string, number>()
  let nextColor = 0

  TOKEN_RE.lastIndex = 0
  for (let match: RegExpExecArray | null; (match = TOKEN_RE.exec(draft)) !== null; ) {
    const [
      full,
      sheetUnquoted,
      sheetQuoted,
      endSheetUnquoted,
      endSheetQuoted,
      startRaw,
      endRaw,
    ] = match
    if (full.startsWith('"')) continue
    const start = match.index
    const end = start + full.length
    // 不把命名标识符、函数名或 R1C1 的片段当作 A1 引用。
    if (/[\p{L}\p{N}_.]/u.test(draft[start - 1] ?? '') ||
      /[\p{L}\p{N}_.(]/u.test(draft[end] ?? '')) continue

    const rawFirstSheet = sheetUnquoted ?? sheetQuoted?.replace(/''/g, "'")
    const rawSecondSheet = endSheetUnquoted ?? endSheetQuoted?.replace(/''/g, "'")
    const quotedSpan =
      rawSecondSheet === undefined && sheetQuoted !== undefined && rawFirstSheet !== undefined
        ? splitQuoted3DSpan(rawFirstSheet)
        : null

    let sheetId: string | null
    let sheetIds: readonly string[] | undefined
    let sheetKey: string
    if (rawFirstSheet !== undefined && rawSecondSheet !== undefined) {
      const resolved = resolveFormulaReference3DSpan(
        rawFirstSheet,
        rawSecondSheet,
        currentSheetId,
        sheets,
      )
      sheetId = resolved.sheetId
      sheetIds = resolved.sheetIds
      sheetKey = resolved.spanKey
    } else if (quotedSpan !== null) {
      const resolved = resolveFormulaReference3DSpan(
        quotedSpan[0],
        quotedSpan[1],
        currentSheetId,
        sheets,
      )
      sheetId = resolved.sheetId
      sheetIds = resolved.sheetIds
      sheetKey = resolved.spanKey
    } else {
      sheetId = resolveFormulaReferenceSheetId(rawFirstSheet, currentSheetId, sheets)
      sheetKey = sheetId ?? '<active>'
    }

    const startCoord = parseA1(startRaw.replace(/\$/g, ''))
    if (!startCoord) continue
    const endCoord = endRaw ? parseA1(endRaw.replace(/\$/g, '')) : startCoord
    if (!endCoord) continue

    const range: CellRange = {
      rowStart: Math.min(startCoord.row, endCoord.row),
      rowEnd: Math.max(startCoord.row, endCoord.row),
      colStart: Math.min(startCoord.col, endCoord.col),
      colEnd: Math.max(startCoord.col, endCoord.col),
    }

    const key =
      `${sheetKey}:${range.rowStart}:${range.colStart}:${range.rowEnd}:${range.colEnd}`
    let colorIndex = colorByKey.get(key)
    if (colorIndex === undefined) {
      colorIndex = nextColor
      nextColor += 1
      colorByKey.set(key, colorIndex)
    }

    tokens.push({
      start,
      end,
      text: full,
      sheetId,
      ...(sheetIds ? { sheetIds } : {}),
      range,
      colorIndex,
    })
  }

  return tokens
}
