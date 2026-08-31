// 一句话：序列填充请求的几何合法性判定。

import type { CellRange, FillSeriesRequest } from '@einfach/spreadsheet-ui-core'

export function invalidFillSeries(message: string): never {
  throw new Error(`invalid fill series: ${message}`)
}

export function isFillSeriesDirection(value: unknown): value is FillSeriesRequest['direction'] {
  return value === 'up' || value === 'down' || value === 'left' || value === 'right'
}

function isCanonicalFillSeriesRange(range: CellRange): boolean {
  return (
    Number.isSafeInteger(range.rowStart) &&
    Number.isSafeInteger(range.rowEnd) &&
    Number.isSafeInteger(range.colStart) &&
    Number.isSafeInteger(range.colEnd) &&
    range.rowStart >= 0 &&
    range.colStart >= 0 &&
    range.rowStart <= range.rowEnd &&
    range.colStart <= range.colEnd
  )
}

export function validateFillSeriesGeometry(request: FillSeriesRequest): void {
  const source = request.sourceRange
  const target = request.targetRange
  if (!isCanonicalFillSeriesRange(source) || !isCanonicalFillSeriesRange(target)) {
    invalidFillSeries('ranges must use canonical non-negative safe-integer bounds')
  }

  if (request.direction === 'down' || request.direction === 'up') {
    if (source.colStart !== source.colEnd) {
      invalidFillSeries('vertical series require source cells in one column')
    }
    if (target.colStart !== source.colStart || target.colEnd !== source.colEnd) {
      invalidFillSeries('vertical target must stay in the source column')
    }
    if (
      request.direction === 'down'
        ? target.rowStart !== source.rowStart || target.rowEnd < source.rowEnd
        : target.rowEnd !== source.rowEnd || target.rowStart > source.rowStart
    ) {
      invalidFillSeries('target does not extend the source in the requested direction')
    }
    return
  }

  if (source.rowStart !== source.rowEnd) {
    invalidFillSeries('horizontal series require source cells in one row')
  }
  if (target.rowStart !== source.rowStart || target.rowEnd !== source.rowEnd) {
    invalidFillSeries('horizontal target must stay in the source row')
  }
  if (
    request.direction === 'right'
      ? target.colStart !== source.colStart || target.colEnd < source.colEnd
      : target.colEnd !== source.colEnd || target.colStart > source.colStart
  ) {
    invalidFillSeries('target does not extend the source in the requested direction')
  }
}

export function getFillSeriesSourceCellCount(request: FillSeriesRequest): number {
  return request.direction === 'down' || request.direction === 'up'
    ? request.sourceRange.rowEnd - request.sourceRange.rowStart + 1
    : request.sourceRange.colEnd - request.sourceRange.colStart + 1
}

export function fillSeriesSourceRelativeIndex(
  request: FillSeriesRequest,
  row: number,
  col: number,
): number {
  return request.direction === 'down' || request.direction === 'up'
    ? row - request.sourceRange.rowStart
    : col - request.sourceRange.colStart
}
