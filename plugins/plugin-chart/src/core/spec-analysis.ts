/** 分析元素（趋势线、误差线）与配色方案的设置字段及其容错解析；字段语义同 Excel。 */
export const TRENDLINE_KINDS =
  ['linear', 'exponential', 'logarithmic', 'polynomial', 'power', 'movingAverage'] as const
export type TrendlineKind = (typeof TRENDLINE_KINDS)[number]
export const ERROR_BAR_KINDS = ['fixed', 'percent', 'stdDev', 'stdErr'] as const
export type ErrorBarKind = (typeof ERROR_BAR_KINDS)[number]
export const ERROR_BAR_DIRECTIONS = ['both', 'plus', 'minus'] as const
export type ErrorBarDirection = (typeof ERROR_BAR_DIRECTIONS)[number]
/** 「更改颜色」：office 是默认的彩色方案，其余是彩色变体或单色渐变。 */
export const CHART_PALETTES =
  ['office', 'colorful', 'warm', 'cool', 'blue', 'orange', 'green', 'gray'] as const
export type ChartPalette = (typeof CHART_PALETTES)[number]

export interface Trendline {
  readonly kind: TrendlineKind
  /** 多项式阶数 2–6。 */
  readonly order: number
  /** 移动平均周期 2–255。 */
  readonly period: number
  readonly showEquation: boolean
  readonly showR2: boolean
}

export interface ErrorBars {
  readonly kind: ErrorBarKind
  /** 固定值、百分比（5 表示 5%）或标准偏差倍数；标准误差不用。 */
  readonly amount: number
  readonly direction: ErrorBarDirection
}

export const MIN_TRENDLINE_ORDER = 2
export const MAX_TRENDLINE_ORDER = 6
export const MIN_TRENDLINE_PERIOD = 2
export const MAX_TRENDLINE_PERIOD = 255
const MAX_TRENDLINES = 64

export const DEFAULT_TRENDLINE: Trendline =
  { kind: 'linear', order: 2, period: 2, showEquation: false, showR2: false }
/** Excel 各类误差线的默认量：固定值 1、百分比 5%、标准偏差 1 倍。 */
export const DEFAULT_ERROR_AMOUNT: Record<ErrorBarKind, number> =
  { fixed: 1, percent: 5, stdDev: 1, stdErr: 1 }

const record = (value: unknown) =>
  value && typeof value === 'object' ? value as Record<string, unknown> : null
const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  values.includes(value as T) ? (value as T) : fallback
const integer = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value : fallback

export function parseTrendline(value: unknown): Trendline | null {
  const source = record(value)
  if (!source || !TRENDLINE_KINDS.includes(source.kind as TrendlineKind)) return null
  const d = DEFAULT_TRENDLINE
  return {
    kind: source.kind as TrendlineKind,
    order: integer(source.order, MIN_TRENDLINE_ORDER, MAX_TRENDLINE_ORDER, d.order),
    period: integer(source.period, MIN_TRENDLINE_PERIOD, MAX_TRENDLINE_PERIOD, d.period),
    showEquation: source.showEquation === true,
    showR2: source.showR2 === true,
  }
}

export function parseTrendlines(value: unknown): readonly (Trendline | null)[] {
  return Array.isArray(value) ? value.slice(0, MAX_TRENDLINES).map(parseTrendline) : []
}

export function parseErrorBars(value: unknown): ErrorBars | null {
  const source = record(value)
  if (!source || !ERROR_BAR_KINDS.includes(source.kind as ErrorBarKind)) return null
  const kind = source.kind as ErrorBarKind
  const amount = typeof source.amount === 'number' && Number.isFinite(source.amount) &&
    source.amount >= 0 ? source.amount : DEFAULT_ERROR_AMOUNT[kind]
  return { kind, amount, direction: oneOf(ERROR_BAR_DIRECTIONS, source.direction, 'both') }
}

export function parsePalette(value: unknown): ChartPalette {
  return oneOf(CHART_PALETTES, value, 'office')
}
