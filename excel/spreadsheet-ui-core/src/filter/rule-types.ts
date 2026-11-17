export type ColumnFilterRule =
  | { kind: 'equals'; colIndex: number; value: string; caseSensitive?: boolean }
  | { kind: 'contains'; colIndex: number; value: string; caseSensitive?: boolean }
  | { kind: 'range'; colIndex: number; min?: number; max?: number }
  | { kind: 'list'; colIndex: number; values: readonly string[] }
  | { kind: 'top'; colIndex: number; direction: 'top' | 'bottom';
      unit: 'items' | 'percent'; value: number }

export interface ColumnFilterGroup {
  readonly rules: readonly ColumnFilterRule[]
}

