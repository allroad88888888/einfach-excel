// 一句话：把填充请求校验并翻译成 AutoFill 线格式。

import type { CellRange, FillRangeRequest, FillSeriesRequest } from '@einfach/spreadsheet-ui-core'
import {
  BUILTIN_FILL_SERIES_MONTH_LONG_NAMES,
  BUILTIN_FILL_SERIES_MONTH_NAMES,
  BUILTIN_FILL_SERIES_WEEKDAY_LONG_NAMES,
  BUILTIN_FILL_SERIES_WEEKDAY_NAMES,
  DEFAULT_FILL_SERIES_LOCALE,
  getFillHandleWriteRange,
  normalizeCustomFillSeriesListWitness,
  normalizeFillSeriesListWitness,
} from '@einfach/spreadsheet-ui-core'
import type { AutoFillRangeWire, AutoFillRequestWire } from '../worker-protocol'
import { createBackendError } from './backend-error'
import { MAX_AUTO_FILL_CELLS } from './limits'

const EXCEL_AUTO_FILL_MAX_ROW = 1_048_575
const EXCEL_AUTO_FILL_MAX_COL = 16_383

const AUTO_FILL_DIRECTIONS = new Set(['up', 'down', 'left', 'right'])
const AUTO_FILL_SERIES = new Set([
  'copy',
  'integer-step',
  'decimal-step',
  'linear-trend',
  'date-day',
  'date-week',
  'date-month',
  'text-number',
  'weekday-name',
  'month-name',
  'custom-list',
])

export function invalidAutoFill(message: string): never {
  throw createBackendError('INVALID_AUTO_FILL', `invalid auto-fill request: ${message}`)
}

function isCanonicalAutoFillRange(range: CellRange): boolean {
  return (
    Number.isSafeInteger(range.rowStart) &&
    Number.isSafeInteger(range.rowEnd) &&
    Number.isSafeInteger(range.colStart) &&
    Number.isSafeInteger(range.colEnd) &&
    range.rowStart >= 0 &&
    range.colStart >= 0 &&
    range.rowStart <= range.rowEnd &&
    range.colStart <= range.colEnd &&
    range.rowEnd <= EXCEL_AUTO_FILL_MAX_ROW &&
    range.colEnd <= EXCEL_AUTO_FILL_MAX_COL
  )
}

function toAutoFillRangeWire(range: CellRange): AutoFillRangeWire {
  return {
    startRow: range.rowStart,
    startCol: range.colStart,
    endRow: range.rowEnd,
    endCol: range.colEnd,
  }
}

function validateAutoFillGeometry(
  source: CellRange,
  target: CellRange,
  direction: FillRangeRequest['direction'],
  series: FillSeriesRequest['series'] | 'copy',
): void {
  if (!isCanonicalAutoFillRange(source) || !isCanonicalAutoFillRange(target)) {
    invalidAutoFill('ranges must be canonical and inside the Excel grid')
  }
  const targetCells = (target.rowEnd - target.rowStart + 1) * (target.colEnd - target.colStart + 1)
  if (targetCells > MAX_AUTO_FILL_CELLS) {
    invalidAutoFill(
      `target spans ${targetCells} cells but the engine cap is ${MAX_AUTO_FILL_CELLS}`,
    )
  }

  if (direction === 'up' || direction === 'down') {
    if (target.colStart !== source.colStart || target.colEnd !== source.colEnd) {
      invalidAutoFill('vertical target must keep the source columns')
    }
    if (series !== 'copy' && source.colStart !== source.colEnd) {
      invalidAutoFill('vertical series require one source column')
    }
    const doesExtend =
      direction === 'down'
        ? target.rowStart === source.rowStart && target.rowEnd >= source.rowEnd
        : target.rowEnd === source.rowEnd && target.rowStart <= source.rowStart
    if (!doesExtend) {
      invalidAutoFill('target does not extend the source in the requested direction')
    }
    return
  }

  if (target.rowStart !== source.rowStart || target.rowEnd !== source.rowEnd) {
    invalidAutoFill('horizontal target must keep the source rows')
  }
  if (series !== 'copy' && source.rowStart !== source.rowEnd) {
    invalidAutoFill('horizontal series require one source row')
  }
  const doesExtend =
    direction === 'right'
      ? target.colStart === source.colStart && target.colEnd >= source.colEnd
      : target.colEnd === source.colEnd && target.colStart <= source.colStart
  if (!doesExtend) {
    invalidAutoFill('target does not extend the source in the requested direction')
  }
}

function autoFillSourceCellCount(request: FillSeriesRequest): number {
  return request.direction === 'up' || request.direction === 'down'
    ? request.sourceRange.rowEnd - request.sourceRange.rowStart + 1
    : request.sourceRange.colEnd - request.sourceRange.colStart + 1
}

function sameAutoFillList(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function normalizeAutoFillListWitness(
  request: FillSeriesRequest,
): AutoFillRequestWire['list'] {
  const witness = normalizeFillSeriesListWitness(request.list)
  if (!witness) {
    invalidAutoFill('named series require a valid bounded list witness and canonical locale')
  }
  if (
    request.series === 'custom-list' &&
    normalizeCustomFillSeriesListWitness(witness) === null
  ) {
    invalidAutoFill('custom list witness may not use a reserved list name')
  }

  const builtinValues =
    witness.listName === 'builtin-weekday-short'
      ? BUILTIN_FILL_SERIES_WEEKDAY_NAMES
      : witness.listName === 'builtin-weekday-long'
        ? BUILTIN_FILL_SERIES_WEEKDAY_LONG_NAMES
        : witness.listName === 'builtin-month-short'
          ? BUILTIN_FILL_SERIES_MONTH_NAMES
          : witness.listName === 'builtin-month-long'
            ? BUILTIN_FILL_SERIES_MONTH_LONG_NAMES
            : null
  if (
    witness.listName.startsWith('builtin-') &&
    (witness.locale !== DEFAULT_FILL_SERIES_LOCALE ||
      builtinValues === null ||
      !sameAutoFillList(witness.values, builtinValues))
  ) {
    invalidAutoFill('built-in list witness does not match the canonical English list')
  }
  if (
    (request.series === 'weekday-name' &&
      !(
        witness.listName.startsWith('builtin-weekday-') ||
        witness.listName === 'locale-weekday'
      )) ||
    (request.series === 'month-name' &&
      !(
        witness.listName.startsWith('builtin-month-') ||
        witness.listName === 'locale-month'
      ))
  ) {
    invalidAutoFill('named series kind does not match its list witness')
  }
  return {
    listName: witness.listName,
    values: [...witness.values],
    locale: witness.locale,
  }
}

export function prepareAutoFillWireRequest(
  sheet: number,
  request: FillRangeRequest | FillSeriesRequest,
): { readonly wire: AutoFillRequestWire; readonly writeRange: CellRange | null } {
  const runtimeRequest = request as {
    readonly kind?: unknown
    readonly direction?: unknown
    readonly series?: unknown
  }
  const isSeries = runtimeRequest.kind === 'fill-series'
  if (runtimeRequest.kind !== 'fill-range' && !isSeries) {
    invalidAutoFill('request kind must be fill-range or fill-series')
  }
  if (
    typeof runtimeRequest.direction !== 'string' ||
    !AUTO_FILL_DIRECTIONS.has(runtimeRequest.direction)
  ) {
    invalidAutoFill('direction must be up, down, left, or right')
  }

  const direction = runtimeRequest.direction as FillRangeRequest['direction']
  const series = isSeries ? runtimeRequest.series : 'copy'
  if (typeof series !== 'string' || !AUTO_FILL_SERIES.has(series)) {
    invalidAutoFill('series kind is unsupported')
  }
  validateAutoFillGeometry(
    request.sourceRange,
    request.targetRange,
    direction,
    series as FillSeriesRequest['series'],
  )

  let step: number | undefined
  let textPattern: AutoFillRequestWire['textPattern']
  let list: AutoFillRequestWire['list']
  if (isSeries && series !== 'copy') {
    const seriesRequest = request as FillSeriesRequest
    if (
      typeof seriesRequest.step !== 'number' ||
      !Number.isFinite(seriesRequest.step) ||
      seriesRequest.step === 0
    ) {
      invalidAutoFill('step must be finite and non-zero')
    }
    step = seriesRequest.step

    const minimumSourceCells =
      series === 'linear-trend'
        ? 3
        : series === 'integer-step' || series === 'decimal-step'
          ? 2
          : 1
    if (autoFillSourceCellCount(seriesRequest) < minimumSourceCells) {
      invalidAutoFill(`${series} requires at least ${minimumSourceCells} source cells`)
    }

    if (
      (series === 'date-day' ||
        series === 'date-week' ||
        series === 'date-month' ||
        series === 'text-number') &&
      !Number.isSafeInteger(step)
    ) {
      invalidAutoFill('calendar and text-number steps must be safe integers')
    }
    if (
      (series === 'weekday-name' || series === 'month-name' || series === 'custom-list') &&
      step !== 1 &&
      step !== -1
    ) {
      invalidAutoFill('named series step must be 1 or -1')
    }
    if (series === 'text-number') {
      const pattern = seriesRequest.textPattern
      if (
        typeof pattern !== 'object' ||
        pattern === null ||
        typeof pattern.prefix !== 'string' ||
        typeof pattern.suffix !== 'string' ||
        !Number.isSafeInteger(pattern.width) ||
        pattern.width < 0 ||
        pattern.width > 0xffff_ffff
      ) {
        invalidAutoFill('text-number series require a valid text pattern witness')
      }
      textPattern = {
        prefix: pattern.prefix,
        suffix: pattern.suffix,
        width: pattern.width,
      }
    }
    if (series === 'weekday-name' || series === 'month-name' || series === 'custom-list') {
      list = normalizeAutoFillListWitness(seriesRequest)
    }
  }

  return {
    wire: {
      sheet,
      sourceRange: toAutoFillRangeWire(request.sourceRange),
      targetRange: toAutoFillRangeWire(request.targetRange),
      direction,
      series: series as AutoFillRequestWire['series'],
      ...(step === undefined ? {} : { step }),
      ...(textPattern === undefined ? {} : { textPattern }),
      ...(list === undefined ? {} : { list }),
    },
    writeRange: getFillHandleWriteRange(
      request.sourceRange,
      request.targetRange,
      direction,
    ),
  }
}
