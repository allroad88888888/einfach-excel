// 一句话：按序列种类挑出「相对序号 → 值」的取值函数。

import type { DisplayCell, FillSeriesRequest } from '@einfach/spreadsheet-ui-core'
import {
  BUILTIN_FILL_SERIES_MONTH_LONG_NAMES,
  BUILTIN_FILL_SERIES_MONTH_NAMES,
  BUILTIN_FILL_SERIES_WEEKDAY_LONG_NAMES,
  BUILTIN_FILL_SERIES_WEEKDAY_NAMES,
  DEFAULT_FILL_SERIES_LOCALE,
  FILL_SERIES_NUMBER_EPSILON,
  analyzeFillSeriesDates,
  calculateFillSeriesLinearTrend,
  foldFillSeriesText,
  formatFillSeriesTextNumber,
  getFillSeriesDateValue,
  isFillSeriesInteger,
  normalizeCustomFillSeriesListWitness,
  parseFillSeriesTextNumber,
} from '@einfach/spreadsheet-ui-core'
import { invalidFillSeries } from './fill-series-geometry'
import { readCanonicalFillSeriesText, readCanonicalFillSeriesValue } from './fill-series-source'
import {
  fillSeriesStepsMatch,
  modulo,
  normalizeRuntimeListWitness,
  normalizeRuntimeTextPattern,
} from './fill-series-witness'

export type StaticGeneratedFillSeriesValue =
  | { readonly valueKind: 'number'; readonly value: number }
  | { readonly valueKind: 'string'; readonly value: string }

/**
 * Pick the value generator for one fill-series kind. Every branch first proves
 * the canonical source cells really encode the requested series (step, trend,
 * calendar cadence, text pattern, named list) and only then returns the
 * `sourceRelativeIndex -> value` function the write loop drives.
 */
export function createFillSeriesValueGenerator(
  request: FillSeriesRequest,
  requestedStep: number,
  sourceCells: Array<DisplayCell | undefined>,
): (sourceRelativeIndex: number) => StaticGeneratedFillSeriesValue | null {
  if (request.series === 'integer-step' || request.series === 'decimal-step') {
    const sourceValues = sourceCells.map(readCanonicalFillSeriesValue)
    for (let index = 1; index < sourceValues.length; index += 1) {
      const delta = sourceValues[index] - sourceValues[index - 1]
      if (!fillSeriesStepsMatch(delta, requestedStep)) {
        invalidFillSeries('source values do not match the requested step')
      }
    }

    const isIntegerSeries =
      Math.abs(requestedStep) >= FILL_SERIES_NUMBER_EPSILON &&
      isFillSeriesInteger(requestedStep) &&
      sourceValues.every(isFillSeriesInteger)
    if (
      (request.series === 'integer-step' && !isIntegerSeries) ||
      (request.series === 'decimal-step' && isIntegerSeries)
    ) {
      invalidFillSeries('series kind does not match the canonical source values')
    }
    const firstValue = sourceValues[0]
    return (sourceRelativeIndex) => {
      const value = firstValue + requestedStep * sourceRelativeIndex
      return Number.isFinite(value) ? { valueKind: 'number', value } : null
    }
  } else if (request.series === 'linear-trend') {
    const sourceValues = sourceCells.map(readCanonicalFillSeriesValue)
    const trend = calculateFillSeriesLinearTrend(sourceValues)
    if (
      !trend ||
      Math.abs(trend.slope) < FILL_SERIES_NUMBER_EPSILON ||
      !fillSeriesStepsMatch(trend.slope, requestedStep)
    ) {
      invalidFillSeries('canonical source values do not match the requested linear trend')
    }
    return (sourceRelativeIndex) => {
      const value = trend.intercept + trend.slope * sourceRelativeIndex
      return Number.isFinite(value) ? { valueKind: 'number', value } : null
    }
  } else if (
    request.series === 'date-day' ||
    request.series === 'date-week' ||
    request.series === 'date-month'
  ) {
    if (!Number.isSafeInteger(requestedStep)) {
      invalidFillSeries('calendar series step must be a non-zero safe integer')
    }
    // Excel parity: dates are plain serial numbers, and fill arithmetic
    // runs on the serial regardless of number format — format affects
    // display only. A date-kind series is not gated on the source cell
    // having an effective date format; only the value-type requirement
    // (`readCanonicalFillSeriesValue`: canonical, non-formula numbers)
    // still applies.
    const sourceValues = sourceCells.map((cell) => readCanonicalFillSeriesValue(cell))
    const analysis = analyzeFillSeriesDates(sourceValues)
    if (
      !analysis ||
      analysis.kind !== request.series ||
      !fillSeriesStepsMatch(analysis.step, requestedStep)
    ) {
      invalidFillSeries('canonical source dates do not match the requested calendar series')
    }
    const preserveEndOfMonth =
      request.series === 'date-month' && analysis.kind === 'date-month'
        ? analysis.preserveEndOfMonth
        : false
    const anchor = sourceValues[0]
    return (sourceRelativeIndex) => {
      const value = getFillSeriesDateValue(
        anchor,
        request.series as 'date-day' | 'date-week' | 'date-month',
        requestedStep,
        sourceRelativeIndex,
        preserveEndOfMonth,
      )
      return value === null ? null : { valueKind: 'number', value }
    }
  } else if (request.series === 'text-number') {
    if (!Number.isSafeInteger(requestedStep)) {
      invalidFillSeries('text-number series step must be a non-zero safe integer')
    }
    const pattern = normalizeRuntimeTextPattern(request.textPattern)
    const parsed = sourceCells.map((cell) =>
      parseFillSeriesTextNumber(readCanonicalFillSeriesText(cell)),
    )
    if (parsed.some((value) => value === null)) {
      invalidFillSeries('source strings do not contain a safe trailing number')
    }
    const sourceValues = parsed as Array<NonNullable<(typeof parsed)[number]>>
    const first = sourceValues[0]
    const establishedWidth = sourceValues.every((value) => value.width === first.width)
      ? first.width
      : 0
    if (
      pattern.prefix !== first.prefix ||
      pattern.suffix !== first.suffix ||
      pattern.width !== establishedWidth
    ) {
      invalidFillSeries('text pattern witness does not match the canonical source strings')
    }
    for (let index = 0; index < sourceValues.length; index += 1) {
      const expected = first.value + requestedStep * index
      if (
        !Number.isSafeInteger(expected) ||
        sourceValues[index].prefix !== first.prefix ||
        sourceValues[index].suffix !== first.suffix ||
        sourceValues[index].value !== expected
      ) {
        invalidFillSeries('source strings do not match the requested text-number step')
      }
    }
    return (sourceRelativeIndex) => {
      const numericPart = first.value + requestedStep * sourceRelativeIndex
      const value = formatFillSeriesTextNumber(pattern, numericPart)
      return value === null ? null : { valueKind: 'string', value }
    }
  } else if (
    request.series === 'weekday-name' ||
    request.series === 'month-name' ||
    request.series === 'custom-list'
  ) {
    if (requestedStep !== 1 && requestedStep !== -1) {
      invalidFillSeries('named series step must be 1 or -1')
    }
    const witness = normalizeRuntimeListWitness(request.list)
    if (
      request.series === 'custom-list' &&
      normalizeCustomFillSeriesListWitness(witness) === null
    ) {
      invalidFillSeries('custom list witness may not use a reserved list name')
    }
    const canonicalBuiltinList =
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
        canonicalBuiltinList === null ||
        canonicalBuiltinList.length !== witness.values.length ||
        !canonicalBuiltinList.every((value, index) => value === witness.values[index]))
    ) {
      invalidFillSeries('built-in list witness does not match the canonical list')
    }
    if (
      (request.series === 'weekday-name' &&
        !(
          witness.listName.startsWith('builtin-weekday-') || witness.listName === 'locale-weekday'
        )) ||
      (request.series === 'month-name' &&
        !(witness.listName.startsWith('builtin-month-') || witness.listName === 'locale-month'))
    ) {
      invalidFillSeries('named series kind does not match its list witness')
    }
    const normalizedList = witness.values.map((value) => foldFillSeriesText(value, witness.locale))
    const sourceValues = sourceCells.map(readCanonicalFillSeriesText)
    const indices = sourceValues.map((value) =>
      normalizedList.indexOf(foldFillSeriesText(value, witness.locale)),
    )
    if (indices.some((index) => index < 0)) {
      invalidFillSeries('source strings do not belong to the requested named list')
    }
    for (let index = 0; index < indices.length; index += 1) {
      if (indices[index] !== modulo(indices[0] + requestedStep * index, witness.values.length)) {
        invalidFillSeries('source strings do not match the requested named-list step')
      }
    }
    const firstIndex = indices[0]
    return (sourceRelativeIndex) => ({
      valueKind: 'string',
      value:
        witness.values[
          modulo(firstIndex + requestedStep * sourceRelativeIndex, witness.values.length)
        ],
    })
  } else {
    invalidFillSeries('unsupported series kind')
  }
}
