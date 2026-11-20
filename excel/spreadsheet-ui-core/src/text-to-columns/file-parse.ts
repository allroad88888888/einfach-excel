import type {
  RustTextColumnRule,
  RustTextColumnType,
  RustTextColumnsMode,
  RustTextColumnsNumberOptions,
  RustTextColumnsPreview,
} from '../rust-workbook/text-columns-commands'
import type { CellCoord, CellRange } from '../shared'
import { convertFileField, validateNumberOptions } from './file-values'

export const MAX_TEXT_COLUMNS_FILE_BYTES = 16 * 1024 * 1024
const MAX_PLAN_CELLS = 100_000
const MAX_PLAN_BYTES = 32 * 1024 * 1024
const EXCEL_MAX_COLS = 16_384
const PREVIEW_ROWS = 20
const PREVIEW_COLS = 12
const PREVIEW_CHARS = 120

export interface ImportedTextFile {
  readonly name: string
  readonly lines: readonly string[]
  readonly defaultDelimiters: string
}

export interface FileTextColumnsPlan extends Omit<RustTextColumnsPreview, 'overwrittenCells'> {
  readonly tsv: string
}

export function inferredDelimiterForFilename(name: string): string {
  const lower = name.trim().toLowerCase()
  if (lower.endsWith('.tsv')) return '\t'
  return ','
}

export function parseImportedTextFile(
  name: string,
  size: number,
  rawText: string,
): ImportedTextFile | string {
  if (!Number.isFinite(size) || size < 0) return 'Invalid file size.'
  if (size > MAX_TEXT_COLUMNS_FILE_BYTES)
    return 'File exceeds the 16 MiB limit. Choose a smaller file.'
  if (size === 0 || rawText.length === 0) return 'The selected file is empty.'
  const bytes = new TextEncoder().encode(rawText).byteLength
  if (bytes > MAX_TEXT_COLUMNS_FILE_BYTES)
    return 'File exceeds the 16 MiB limit. Choose a smaller file.'
  const withoutBom = rawText.startsWith('\uFEFF') ? rawText.slice(1) : rawText
  const normalized = withoutBom.replace(/\r\n?/g, '\n')
  const body = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
  if (body.length === 0) return 'The selected file is empty.'
  const lines = body.split('\n')
  if (lines.length > MAX_PLAN_CELLS)
    return 'Split exceeds 100,000 cells. Choose a smaller range.'
  return Object.freeze({
    name,
    lines: Object.freeze(lines),
    defaultDelimiters: inferredDelimiterForFilename(name),
  })
}

function splitLine(line: string, mode: RustTextColumnsMode): string[] | string {
  if (mode.kind === 'fixedWidth') {
    const { breakpoints } = mode
    if (!breakpoints.length || breakpoints[0]! <= 0)
      return 'Choose positive fixed-width break positions.'
    for (let i = 1; i < breakpoints.length; i += 1) {
      if (breakpoints[i]! <= breakpoints[i - 1]!)
        return 'Fixed-width break positions must increase without duplicates.'
    }
    if (breakpoints.length >= EXCEL_MAX_COLS)
      return 'Split output exceeds the worksheet column limit.'
    const chars = Array.from(line)
    const fields: string[] = []
    let current = ''
    let next = 0
    for (let pos = 0; pos < chars.length; pos += 1) {
      if (breakpoints[next] === pos) {
        fields.push(current)
        current = ''
        next += 1
      }
      current += chars[pos]!
    }
    fields.push(current)
    while (fields.length < breakpoints.length + 1) fields.push('')
    return fields
  }
  const { delimiters, mergeConsecutive, qualifier } = mode
  if (!delimiters.length) return 'Choose at least one delimiter.'
  const delimSet = new Set(delimiters)
  if (qualifier !== null && delimSet.has(qualifier))
    return 'The text qualifier cannot also be a delimiter.'
  const chars = Array.from(line)
  const fields: string[] = []
  let current = ''
  let quoted = false
  let fieldStart = true
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]!
    if (qualifier !== null && ch === qualifier) {
      if (quoted) {
        if (chars[i + 1] === ch) {
          current += ch
          i += 1
        } else {
          quoted = false
        }
        continue
      }
      if (fieldStart) {
        quoted = true
        fieldStart = false
        continue
      }
    }
    if (!quoted && delimSet.has(ch)) {
      if (fields.length + 1 >= EXCEL_MAX_COLS)
        return 'Split output exceeds the worksheet column limit.'
      fields.push(current)
      current = ''
      fieldStart = true
      if (mergeConsecutive) {
        while (i + 1 < chars.length && delimSet.has(chars[i + 1]!)) i += 1
      }
    } else {
      current += ch
      fieldStart = false
    }
  }
  if (quoted) return 'A text qualifier is not closed. Correct the text or choose no qualifier.'
  fields.push(current)
  return fields
}

function encodeTsvField(field: string): string {
  if (/[\t\n\r"]/.test(field)) return `"${field.replaceAll('"', '""')}"`
  return field
}

function encodePlanTsv(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row, rowIndex) => {
      if (rowIndex === rows.length - 1 && rows.length > 1 && row.length === 1 && row[0] === '')
        return '""'
      return row.map(encodeTsvField).join('\t')
    })
    .join('\n')
}

export function planFileTextColumns(input: {
  readonly lines: readonly string[]
  readonly destination: CellCoord
  readonly rowCount: number
  readonly colCount: number
  readonly mode: RustTextColumnsMode
  readonly columnTypes?: readonly RustTextColumnRule[]
  readonly numberOptions?: RustTextColumnsNumberOptions
}): FileTextColumnsPlan | string {
  const { lines, destination, rowCount, colCount, mode, columnTypes = [], numberOptions } = input
  if (!lines.length) return 'The selected file is empty.'
  const numberError = validateNumberOptions(numberOptions)
  if (numberError) return numberError
  const rules = new Map<number, RustTextColumnType>()
  for (const rule of columnTypes) {
    if (rule.column < 0 || rule.column >= EXCEL_MAX_COLS || rules.has(rule.column))
      return 'Invalid or duplicate source field type.'
    rules.set(rule.column, rule.kind)
  }
  const rows = lines.length
  if (rows > MAX_PLAN_CELLS) return 'Split exceeds 100,000 cells. Choose a smaller range.'
  if (
    destination.row < 0 ||
    destination.col < 0 ||
    destination.row >= rowCount ||
    destination.col >= colCount ||
    rows > rowCount - destination.row
  )
    return 'Split output exceeds the worksheet boundary.'

  const rawRows: string[][] = []
  let sourceColumns = 1
  let totalBytes = 0
  for (const line of lines) {
    const split = splitLine(line, mode)
    if (typeof split === 'string') return split
    for (const token of split) totalBytes += token.length * 2
    sourceColumns = Math.max(sourceColumns, split.length)
    if (totalBytes > MAX_PLAN_BYTES || rows * sourceColumns > MAX_PLAN_CELLS)
      return 'Split exceeds 100,000 cells or 32 MiB. Choose a smaller range.'
    rawRows.push(split)
  }
  for (const col of rules.keys()) {
    if (col >= sourceColumns) return 'A column type refers to a missing source field.'
  }
  let skipCount = 0
  for (const kind of rules.values()) if (kind === 'skip') skipCount += 1
  const outputColumns = sourceColumns - skipCount
  if (outputColumns <= 0) return 'Keep at least one source field.'
  if (outputColumns > colCount - destination.col)
    return 'Split output exceeds the worksheet boundary.'

  const target: CellRange = {
    rowStart: destination.row,
    colStart: destination.col,
    rowEnd: destination.row + rows - 1,
    colEnd: destination.col + outputColumns - 1,
  }
  let sampleTruncated = rows > PREVIEW_ROWS || outputColumns > PREVIEW_COLS
  const sample: string[][] = []
  const tsvRows: string[][] = []
  for (let r = 0; r < rawRows.length; r += 1) {
    const raw = rawRows[r]!
    const tsvRow: string[] = []
    const sampleRow: string[] | null = r < PREVIEW_ROWS ? [] : null
    for (let c = 0; c < sourceColumns; c += 1) {
      const kind = rules.get(c)
      if (kind === 'skip') continue
      const converted = convertFileField(raw[c] ?? '', kind, numberOptions)
      tsvRow.push(converted.tsvInput)
      if (sampleRow && sampleRow.length < PREVIEW_COLS) {
        const chars = Array.from(converted.display)
        if (chars.length > PREVIEW_CHARS) sampleTruncated = true
        sampleRow.push(chars.slice(0, PREVIEW_CHARS).join(''))
      }
    }
    tsvRows.push(tsvRow)
    if (sampleRow) sample.push(sampleRow)
  }
  return {
    sourceColumnCount: sourceColumns,
    target,
    sample,
    sampleTruncated,
    tsv: encodePlanTsv(tsvRows),
  }
}
