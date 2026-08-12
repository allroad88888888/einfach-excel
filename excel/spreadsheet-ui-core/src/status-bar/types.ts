export type StatusBarAggregateKey =
  | 'sum'
  | 'average'
  | 'count'
  | 'numericCount'
  | 'min'
  | 'max'

export interface SelectionAggregates {
  sum: number
  average: number
  count: number
  numericCount: number
  min: number
  max: number
  truncated: boolean
}

export type StatusBarAggregateConfig = Readonly<Record<StatusBarAggregateKey, boolean>>

export type StatusBarInputMode = 'ready' | 'edit' | 'enter' | 'point'

export const STATUS_BAR_AGGREGATE_KEYS: readonly StatusBarAggregateKey[] = [
  'sum',
  'average',
  'count',
  'numericCount',
  'min',
  'max',
] as const

export const DEFAULT_STATUS_BAR_AGGREGATE_CONFIG: StatusBarAggregateConfig = Object.freeze({
  sum: true,
  average: true,
  count: true,
  numericCount: false,
  min: false,
  max: false,
})
