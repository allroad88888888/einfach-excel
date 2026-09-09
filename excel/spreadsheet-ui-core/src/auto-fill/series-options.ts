/** 同一份序列入口定义，供面板和传输校验使用；实际规律只由 Rust 推断。 */
export const FILL_SERIES_OPTIONS = [
  { kind: 'number', label: 'Number sequence', samples: 2 },
  { kind: 'text-number', label: 'Text numbering', samples: 2 },
  { kind: 'linear-trend', label: 'Linear trend', samples: 3 },
  { kind: 'weekday-name', label: 'Weekday names', samples: 1 },
  { kind: 'month-name', label: 'Month names', samples: 1 },
  { kind: 'custom-list', label: 'Custom list', samples: 1 },
] as const

export type FillSeriesKind = typeof FILL_SERIES_OPTIONS[number]['kind']

/** 未知选项不能通过最少样本数校验。 */
export function minimumFillSamples(kind: string): number {
  return FILL_SERIES_OPTIONS.find((option) => option.kind === kind)?.samples ?? Infinity
}
