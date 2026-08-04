// 一句话：序列填充请求所携证据的归一化。

import type { FillSeriesRequest } from '@einfach/spreadsheet-ui-core'
import {
  FILL_SERIES_NUMBER_EPSILON,
  normalizeFillSeriesListWitness,
} from '@einfach/spreadsheet-ui-core'
import { invalidFillSeries } from './fill-series-geometry'
import { isObject } from './guards'

export function fillSeriesStepsMatch(actual: number, requested: number): boolean {
  if (!Number.isFinite(actual)) return false
  if (Math.abs(requested) >= FILL_SERIES_NUMBER_EPSILON) {
    return Math.abs(actual - requested) < FILL_SERIES_NUMBER_EPSILON
  }

  // The detector intentionally treats near-zero deltas as copy. The backend
  // protocol still accepts any strictly non-zero finite step, so direct tiny
  // steps use a floating-point-relative comparison instead of that UI cutoff.
  const magnitude = Math.max(Math.abs(actual), Math.abs(requested), Number.MIN_VALUE)
  return Math.abs(actual - requested) <= Number.EPSILON * magnitude * 8
}

export function normalizeRuntimeTextPattern(
  value: FillSeriesRequest['textPattern'],
): NonNullable<FillSeriesRequest['textPattern']> {
  if (
    !isObject(value) ||
    typeof value.prefix !== 'string' ||
    typeof value.suffix !== 'string' ||
    !Number.isSafeInteger(value.width) ||
    value.width < 0
  ) {
    invalidFillSeries('text-number series require a valid text pattern witness')
  }
  return {
    prefix: value.prefix,
    suffix: value.suffix,
    width: value.width,
  }
}

export function normalizeRuntimeListWitness(value: FillSeriesRequest['list']): {
  readonly listName: string
  readonly values: readonly string[]
  readonly locale: string
} {
  const witness = normalizeFillSeriesListWitness(value)
  if (!witness) {
    invalidFillSeries('named series require a valid bounded list witness')
  }
  return witness
}

export function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}
