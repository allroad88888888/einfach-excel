import type { ProjectionRevision } from '../backend/types'
import type {
  SpreadsheetBorderSpec,
  SpreadsheetBorders,
  SpreadsheetCellFormat,
} from '../backend/types'
import type { CellRange } from '../shared'

export function isProjectionRevision(value: unknown): value is ProjectionRevision {
  return (
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.length > 0)
  )
}

export function isCellRange(value: Readonly<CellRange>): boolean {
  return (
    Number.isSafeInteger(value.rowStart) &&
    Number.isSafeInteger(value.rowEnd) &&
    Number.isSafeInteger(value.colStart) &&
    Number.isSafeInteger(value.colEnd) &&
    value.rowStart >= 0 &&
    value.colStart >= 0 &&
    value.rowStart <= value.rowEnd &&
    value.colStart <= value.colEnd
  )
}

export function snapshotRange(range: Readonly<CellRange>): Readonly<CellRange> {
  return Object.freeze({
    rowStart: range.rowStart,
    rowEnd: range.rowEnd,
    colStart: range.colStart,
    colEnd: range.colEnd,
  })
}

export function snapshotBorderSpec(
  spec: SpreadsheetBorderSpec | undefined,
): SpreadsheetBorderSpec | undefined {
  return spec ? Object.freeze({ ...spec }) : undefined
}

export function snapshotBorders(
  borders: SpreadsheetBorders | undefined,
): SpreadsheetBorders | undefined {
  if (!borders) return undefined
  return Object.freeze({
    ...(borders.top ? { top: snapshotBorderSpec(borders.top) } : {}),
    ...(borders.right ? { right: snapshotBorderSpec(borders.right) } : {}),
    ...(borders.bottom ? { bottom: snapshotBorderSpec(borders.bottom) } : {}),
    ...(borders.left ? { left: snapshotBorderSpec(borders.left) } : {}),
  })
}

export function snapshotFormat(format: SpreadsheetCellFormat | null): SpreadsheetCellFormat | null {
  if (format === null) return null
  return Object.freeze({
    ...format,
    ...(format.numberFormat ? { numberFormat: Object.freeze({ ...format.numberFormat }) } : {}),
    ...(format.borders ? { borders: snapshotBorders(format.borders) } : {}),
  })
}

export function rangesEqual(left: unknown, right: Readonly<CellRange>): boolean {
  if (typeof left !== 'object' || left === null) return false
  const range = left as Partial<CellRange>
  return (
    range.rowStart === right.rowStart &&
    range.rowEnd === right.rowEnd &&
    range.colStart === right.colStart &&
    range.colEnd === right.colEnd
  )
}
