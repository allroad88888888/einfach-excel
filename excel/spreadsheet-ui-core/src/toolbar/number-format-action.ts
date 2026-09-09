import type { SpreadsheetNumberFormat } from '../backend'

export const SELECTION_PERCENT_FORMAT = Object.freeze({
  kind: 'percent' as const,
  digits: 0,
}) satisfies SpreadsheetNumberFormat
export const SELECTION_CURRENCY_FORMAT = Object.freeze({
  kind: 'currency' as const,
  symbol: '$',
  digits: 2,
}) satisfies SpreadsheetNumberFormat
export const SELECTION_THOUSANDS_FORMAT = Object.freeze({
  kind: 'number' as const,
  digits: 2,
  thousands: true,
}) satisfies SpreadsheetNumberFormat

export type NumberFormatAction =
  | 'percent-format'
  | 'currency-format'
  | 'thousands-format'
  | 'general-format'
  | 'date-format'
  | 'increase-decimal'
  | 'decrease-decimal'

/** 常规格式从当前数值的小数位起步，兼容 1e-7 等科学计数表示。 */
function generalDigits(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e')
  return Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent))
}

/** 只生成数字格式；原始数值与其它样式不属于这次修改。 */
export function nextNumberFormat(
  current: SpreadsheetNumberFormat | undefined,
  action: NumberFormatAction,
  numericValue: number | undefined,
): SpreadsheetNumberFormat | null {
  if (action === 'general-format') return { kind: 'general' }
  if (action === 'date-format') return { kind: 'date', pattern: 'yyyy-mm-dd' }
  if (action === 'percent-format') {
    const enabled = current?.kind === 'percent' || current?.kind === 'percentage'
    return enabled ? { kind: 'general' } : SELECTION_PERCENT_FORMAT
  }
  if (action === 'currency-format') {
    return current?.kind === 'currency' ? { kind: 'general' } : SELECTION_CURRENCY_FORMAT
  }
  if (action === 'thousands-format') {
    const enabled =
      (current?.kind === 'number' || current?.kind === 'decimal') && current.thousands === true
    return enabled ? { kind: 'general' } : SELECTION_THOUSANDS_FORMAT
  }

  const format =
    !current || current.kind === 'general'
      ? { kind: 'number' as const, digits: generalDigits(numericValue) }
      : current
  switch (format.kind) {
    case 'number':
    case 'decimal':
    case 'currency':
    case 'accounting':
    case 'scientific':
    case 'percent':
    case 'percentage': {
      const defaultDigits = format.kind === 'percent' || format.kind === 'percentage' ? 0 : 2
      const digits = format.digits ?? defaultDigits
      const delta = action === 'increase-decimal' ? 1 : -1
      // 控制显示精度在 0–15 位内，同时保留币种、千分位与负数显示规则。
      return { ...format, digits: Math.max(0, Math.min(15, digits + delta)) }
    }
    default:
      // 日期、文本与自定义格式不能当成普通小数改写。
      return null
  }
}
