import type { SpreadsheetCellFormat } from '../contracts'

/** Calendar periods are evaluated by Rust using the projection's local date. */
export const CONDITIONAL_TIME_PERIODS = [
  'today', 'yesterday', 'tomorrow', 'last7Days',
  'thisWeek', 'lastWeek', 'nextWeek', 'thisMonth', 'lastMonth', 'nextMonth',
] as const

export interface TimePeriodRule {
  kind: 'time-period'
  period: typeof CONDITIONAL_TIME_PERIODS[number]
  enabled?: boolean
  stopIfTrue?: boolean
  format: SpreadsheetCellFormat
}
