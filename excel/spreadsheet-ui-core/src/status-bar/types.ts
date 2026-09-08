/** 原生统计结果；null 表示没有数值，或求和超过数值范围。 */
export interface SelectionNumbers {
  /** 非空格数，包含文本、布尔、错误和空字符串。 */
  readonly count: number
  readonly numericCount: number
  readonly sum: number | null
  readonly average: number | null
  readonly min: number | null
  readonly max: number | null
}

export type SelectionAggregateState =
  | { readonly status: 'idle' }
  | { readonly status: 'ready'; readonly numbers: SelectionNumbers }
  | { readonly status: 'error'; readonly message: string }
