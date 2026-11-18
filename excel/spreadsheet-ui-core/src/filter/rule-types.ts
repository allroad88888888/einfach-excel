export const filterDatePeriods = [
  'today', 'yesterday', 'tomorrow', 'last-week', 'this-week', 'next-week',
  'last-month', 'this-month', 'next-month', 'last-quarter', 'this-quarter', 'next-quarter',
  'last-year', 'this-year', 'next-year', 'year-to-date',
] as const
export type FilterDatePeriod = typeof filterDatePeriods[number]

export type ColumnFilterRule =
  | { kind: 'equals'; colIndex: number; value: string; caseSensitive?: boolean }
  | { kind: 'contains'; colIndex: number; value: string; caseSensitive?: boolean }
  | { kind: 'range'; colIndex: number; min?: number; max?: number }
  | { kind: 'list'; colIndex: number; values: readonly string[] }
  | { kind: 'top'; colIndex: number; direction: 'top' | 'bottom';
      unit: 'items' | 'percent'; value: number }
  | { kind: 'date-period'; colIndex: number; period: FilterDatePeriod }

export interface ColumnFilterGroup {
  readonly rules: readonly ColumnFilterRule[]
}

