export const filterDatePeriods = [
  'today', 'yesterday', 'tomorrow', 'last-week', 'this-week', 'next-week',
  'last-month', 'this-month', 'next-month', 'last-quarter', 'this-quarter', 'next-quarter',
  'last-year', 'this-year', 'next-year', 'year-to-date',
] as const
export type FilterDatePeriod = typeof filterDatePeriods[number]

export type FilterColorSource = 'fill' | 'font'

export function validFilterColorSource(value: unknown): value is FilterColorSource {
  return value === 'fill' || value === 'font'
}

export function validFilterColorValue(value: unknown): value is string {
  return typeof value === 'string' &&
    (value === 'automatic' || (value.length === 7 && /^#[0-9a-f]{6}$/i.test(value)))
}

export type ColumnFilterRule =
  | { kind: 'equals'; colIndex: number; value: string; caseSensitive?: boolean }
  | { kind: 'contains'; colIndex: number; value: string; caseSensitive?: boolean }
  | { kind: 'range'; colIndex: number; min?: number; max?: number }
  | { kind: 'list'; colIndex: number; values: readonly string[] }
  | { kind: 'top'; colIndex: number; direction: 'top' | 'bottom';
      unit: 'items' | 'percent'; value: number }
  | { kind: 'date-period'; colIndex: number; period: FilterDatePeriod }
  | { kind: 'color'; colIndex: number; source: FilterColorSource; color: string }

export interface ColumnFilterGroup {
  readonly rules: readonly ColumnFilterRule[]
}

