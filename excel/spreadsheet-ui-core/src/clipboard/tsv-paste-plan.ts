import type { CellCoord } from '../shared'
import { parseA1Coord } from './formula-ref-coords'
import { shiftFormulaRefs } from './formula-references'
import { CLIPBOARD_ORIGIN_MARKER_PREFIX } from './tsv-text'
import type {
  ClipboardTsvPasteChunk,
  ClipboardTsvPasteInput,
  ClipboardTsvPastePlan,
} from './types'

export const DEFAULT_CLIPBOARD_TSV_PASTE_ROWS_PER_CHUNK = 1000

function normalizeRowsPerChunk(rowsPerChunk: number | undefined): number {
  if (rowsPerChunk === undefined) return DEFAULT_CLIPBOARD_TSV_PASTE_ROWS_PER_CHUNK
  if (!Number.isFinite(rowsPerChunk)) return DEFAULT_CLIPBOARD_TSV_PASTE_ROWS_PER_CHUNK
  return Math.max(1, Math.floor(rowsPerChunk))
}

function readClipboardLineEnd(
  text: string,
  start: number,
): { lineEnd: number; nextStart: number } {
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (char === '\n') return { lineEnd: index, nextStart: index + 1 }
    if (char === '\r') {
      return {
        lineEnd: index,
        nextStart: text[index + 1] === '\n' ? index + 2 : index + 1,
      }
    }
  }

  return { lineEnd: text.length, nextStart: text.length }
}

function readClipboardTsvOriginMarker(
  text: string,
  fallbackOriginAddr: string,
): { bodyStart: number; originAddr: string } {
  if (!text.startsWith(CLIPBOARD_ORIGIN_MARKER_PREFIX)) {
    return { bodyStart: 0, originAddr: fallbackOriginAddr }
  }

  const markerLine = readClipboardLineEnd(text, 0)
  const originAddr =
    text.slice(CLIPBOARD_ORIGIN_MARKER_PREFIX.length, markerLine.lineEnd).trim() ||
    fallbackOriginAddr

  return {
    bodyStart: markerLine.nextStart,
    originAddr,
  }
}

function trimOneTrailingLineBreak(text: string, bodyStart: number): number {
  const bodyEnd = text.length
  if (bodyEnd <= bodyStart) return bodyEnd

  const lastChar = text[bodyEnd - 1]
  if (lastChar === '\n') {
    if (bodyEnd - 2 >= bodyStart && text[bodyEnd - 2] === '\r') return bodyEnd - 2
    return bodyEnd - 1
  }
  if (lastChar === '\r') return bodyEnd - 1

  return bodyEnd
}

function* iterateClipboardTsvRows(
  text: string,
  bodyStart: number,
): IterableIterator<string> {
  const bodyEnd = trimOneTrailingLineBreak(text, bodyStart)
  if (bodyEnd === bodyStart) {
    yield ''
    return
  }

  let rowStart = bodyStart
  while (rowStart <= bodyEnd) {
    let lineEnd = rowStart
    while (lineEnd < bodyEnd && text[lineEnd] !== '\n' && text[lineEnd] !== '\r') {
      lineEnd += 1
    }

    yield text.slice(rowStart, lineEnd)

    if (lineEnd >= bodyEnd) return
    rowStart =
      text[lineEnd] === '\r' && text[lineEnd + 1] === '\n' ? lineEnd + 2 : lineEnd + 1
  }
}

function countTsvFields(rowText: string): number {
  let count = 1
  for (let index = 0; index < rowText.length; index += 1) {
    if (rowText[index] === '\t') count += 1
  }
  return count
}

function rowIncludesFormula(rowText: string): boolean {
  let fieldStart = 0
  for (let index = 0; index <= rowText.length; index += 1) {
    if (index !== rowText.length && rowText[index] !== '\t') continue
    if (rowText[fieldStart] === '=') return true
    fieldStart = index + 1
  }
  return false
}

function measureClipboardTsvPaste(
  text: string,
  bodyStart: number,
): { rowCount: number; colCount: number; cellCount: number; includesFormulas: boolean } {
  let rowCount = 0
  let colCount = 0
  let cellCount = 0
  let includesFormulas = false

  for (const rowText of iterateClipboardTsvRows(text, bodyStart)) {
    const fieldCount = countTsvFields(rowText)
    rowCount += 1
    colCount = Math.max(colCount, fieldCount)
    cellCount += fieldCount
    if (!includesFormulas && rowIncludesFormula(rowText)) includesFormulas = true
  }

  return { rowCount, colCount, cellCount, includesFormulas }
}

function createClipboardTsvPasteChunks(
  text: string,
  bodyStart: number,
  sourceOrigin: CellCoord,
  targetOrigin: CellCoord,
  rowsPerChunk: number,
  shiftFormulas: boolean,
): IterableIterator<ClipboardTsvPasteChunk> {
  const chunkTargetOrigin = {
    row: targetOrigin.row,
    col: targetOrigin.col,
  }
  const drow = chunkTargetOrigin.row - sourceOrigin.row
  const dcol = chunkTargetOrigin.col - sourceOrigin.col

  function* chunks(): IterableIterator<ClipboardTsvPasteChunk> {
    let rowOffset = 0
    let chunkRowStart = chunkTargetOrigin.row
    let rowsInChunk = 0
    let cellsInChunk: ClipboardTsvPasteChunk['cells'] = []

    for (const rowText of iterateClipboardTsvRows(text, bodyStart)) {
      if (rowsInChunk === 0) chunkRowStart = chunkTargetOrigin.row + rowOffset

      const fields = rowText.split('\t')
      for (let colOffset = 0; colOffset < fields.length; colOffset += 1) {
        const rawInput = fields[colOffset]
        cellsInChunk.push({
          row: chunkTargetOrigin.row + rowOffset,
          col: chunkTargetOrigin.col + colOffset,
          input:
            shiftFormulas && rawInput.startsWith('=')
              ? shiftFormulaRefs(rawInput, drow, dcol)
              : rawInput,
        })
      }

      rowOffset += 1
      rowsInChunk += 1

      if (rowsInChunk >= rowsPerChunk) {
        yield {
          rowStart: chunkRowStart,
          rowEnd: chunkRowStart + rowsInChunk - 1,
          rowCount: rowsInChunk,
          cells: cellsInChunk,
        }
        rowsInChunk = 0
        cellsInChunk = []
      }
    }

    if (rowsInChunk > 0) {
      yield {
        rowStart: chunkRowStart,
        rowEnd: chunkRowStart + rowsInChunk - 1,
        rowCount: rowsInChunk,
        cells: cellsInChunk,
      }
    }
  }

  return chunks()
}

export function createClipboardTsvPastePlan(
  input: ClipboardTsvPasteInput,
): ClipboardTsvPastePlan {
  const text = input.text
  const fallbackOriginAddr = input.fallbackOriginAddr ?? 'A1'
  const marker = readClipboardTsvOriginMarker(text, fallbackOriginAddr)
  const sourceOrigin =
    parseA1Coord(marker.originAddr) ??
    parseA1Coord(fallbackOriginAddr) ?? {
      row: input.targetOrigin.row,
      col: input.targetOrigin.col,
    }
  const targetOrigin = {
    row: input.targetOrigin.row,
    col: input.targetOrigin.col,
  }
  const rowsPerChunk = normalizeRowsPerChunk(input.rowsPerChunk)
  const shiftFormulas = input.shiftFormulas ?? true
  const measured = measureClipboardTsvPaste(text, marker.bodyStart)

  return {
    originAddr: marker.originAddr,
    sourceOrigin: {
      row: sourceOrigin.row,
      col: sourceOrigin.col,
    },
    targetOrigin,
    rowCount: measured.rowCount,
    colCount: measured.colCount,
    cellCount: measured.cellCount,
    includesFormulas: measured.includesFormulas,
    estimatedBytes: text.length,
    estimatedRange: {
      rowStart: targetOrigin.row,
      rowEnd: targetOrigin.row + measured.rowCount - 1,
      colStart: targetOrigin.col,
      colEnd: targetOrigin.col + measured.colCount - 1,
    },
    rowsPerChunk,
    chunks: () =>
      createClipboardTsvPasteChunks(
        text,
        marker.bodyStart,
        sourceOrigin,
        targetOrigin,
        rowsPerChunk,
        shiftFormulas,
      ),
  }
}
