import type { SpreadsheetNumberFormat } from '../backend'

export interface PatternFormatOption {
  id: string
  exampleKey: string
  pattern: string
  numberFormat: SpreadsheetNumberFormat
}

export const DATE_TIME_FORMAT_OPTIONS: readonly PatternFormatOption[] = [
  {
    id: 'date-iso',
    exampleKey: 'numberFormatDialog.dateTime.example.dateIso',
    pattern: 'yyyy-MM-dd',
    numberFormat: { kind: 'date', pattern: 'yyyy-MM-dd' },
  },
  {
    id: 'date-slash',
    exampleKey: 'numberFormatDialog.dateTime.example.dateSlash',
    pattern: 'yyyy/MM/dd',
    numberFormat: { kind: 'date', pattern: 'yyyy/MM/dd' },
  },
  {
    id: 'date-cn',
    exampleKey: 'numberFormatDialog.dateTime.example.dateChinese',
    pattern: 'yyyy年M月d日',
    numberFormat: { kind: 'date', pattern: 'yyyy年M月d日' },
  },
  {
    id: 'date-month-day-padded',
    exampleKey: 'numberFormatDialog.dateTime.example.dateMonthDayPadded',
    pattern: 'MM-dd',
    numberFormat: { kind: 'date', pattern: 'MM-dd' },
  },
  {
    id: 'date-month-day',
    exampleKey: 'numberFormatDialog.dateTime.example.dateMonthDay',
    pattern: 'M-d',
    numberFormat: { kind: 'date', pattern: 'M-d' },
  },
  {
    id: 'date-cn-month-day',
    exampleKey: 'numberFormatDialog.dateTime.example.dateChineseMonthDay',
    pattern: 'M"月"d"日"',
    numberFormat: { kind: 'date', pattern: 'M"月"d"日"' },
  },
  {
    id: 'time-seconds',
    exampleKey: 'numberFormatDialog.dateTime.example.timeSeconds',
    pattern: 'h:mm:ss',
    numberFormat: { kind: 'time', pattern: 'h:mm:ss' },
  },
  {
    id: 'time-24',
    exampleKey: 'numberFormatDialog.dateTime.example.time24',
    pattern: 'h:mm',
    numberFormat: { kind: 'time', pattern: 'h:mm' },
  },
  {
    id: 'time-ampm-padded',
    exampleKey: 'numberFormatDialog.dateTime.example.timeAmPmPadded',
    pattern: 'AM/PM hh:mm',
    numberFormat: { kind: 'time', pattern: 'AM/PM hh:mm' },
  },
  {
    id: 'time-ampm',
    exampleKey: 'numberFormatDialog.dateTime.example.timeAmPm',
    pattern: 'AM/PM h:mm',
    numberFormat: { kind: 'time', pattern: 'AM/PM h:mm' },
  },
  {
    id: 'time-ampm-seconds',
    exampleKey: 'numberFormatDialog.dateTime.example.timeAmPmSeconds',
    pattern: 'AM/PM h:mm:ss',
    numberFormat: { kind: 'time', pattern: 'AM/PM h:mm:ss' },
  },
  {
    id: 'time-cn-ampm-padded',
    exampleKey: 'numberFormatDialog.dateTime.example.timeCnAmPmPadded',
    pattern: '上午/下午 hh:mm',
    numberFormat: { kind: 'time', pattern: 'AM/PM hh:mm' },
  },
  {
    id: 'time-cn-ampm',
    exampleKey: 'numberFormatDialog.dateTime.example.timeCnAmPm',
    pattern: '上午/下午 h:mm',
    numberFormat: { kind: 'time', pattern: 'AM/PM h:mm' },
  },
  {
    id: 'time-cn-ampm-seconds',
    exampleKey: 'numberFormatDialog.dateTime.example.timeCnAmPmSeconds',
    pattern: '上午/下午 h:mm:ss',
    numberFormat: { kind: 'time', pattern: 'AM/PM h:mm:ss' },
  },
  {
    id: 'datetime-month-day-ampm',
    exampleKey: 'numberFormatDialog.dateTime.example.dateTimeMonthDayAmPm',
    pattern: 'MM-dd AM/PM hh:mm',
    numberFormat: { kind: 'custom', pattern: 'MM-dd AM/PM hh:mm' },
  },
  {
    id: 'datetime-month-day-cn-ampm',
    exampleKey: 'numberFormatDialog.dateTime.example.dateTimeMonthDayCnAmPm',
    pattern: 'MM-dd 上午/下午 hh:mm',
    numberFormat: { kind: 'custom', pattern: 'MM-dd AM/PM hh:mm' },
  },
  {
    id: 'datetime-24',
    exampleKey: 'numberFormatDialog.dateTime.example.dateTime24',
    pattern: 'yyyy-MM-dd HH:mm',
    numberFormat: { kind: 'custom', pattern: 'yyyy-MM-dd HH:mm' },
  },
  {
    id: 'datetime-12',
    exampleKey: 'numberFormatDialog.dateTime.example.dateTime12',
    pattern: 'yyyy-MM-dd h:mm AM/PM',
    numberFormat: { kind: 'custom', pattern: 'yyyy-MM-dd h:mm AM/PM' },
  },
]

export const NUMBER_FORMAT_OPTIONS: readonly PatternFormatOption[] = [
  {
    id: 'integer',
    exampleKey: 'numberFormatDialog.number.example.integer',
    pattern: '0',
    numberFormat: { kind: 'number', digits: 0, thousands: false },
  },
  {
    id: 'decimal',
    exampleKey: 'numberFormatDialog.number.example.decimal',
    pattern: '0.00',
    numberFormat: { kind: 'number', digits: 2, thousands: false },
  },
  {
    id: 'thousands',
    exampleKey: 'numberFormatDialog.number.example.thousands',
    pattern: '#,##0',
    numberFormat: { kind: 'number', digits: 0, thousands: true },
  },
  {
    id: 'thousands-decimal',
    exampleKey: 'numberFormatDialog.number.example.thousandsDecimal',
    pattern: '#,##0.00',
    numberFormat: { kind: 'number', digits: 2, thousands: true },
  },
  {
    id: 'parens-integer',
    exampleKey: 'numberFormatDialog.number.example.parensInteger',
    pattern: '#,##0_);(#,##0)',
    numberFormat: { kind: 'number', digits: 0, thousands: true, negative: 'parens' },
  },
  {
    id: 'red-parens-integer',
    exampleKey: 'numberFormatDialog.number.example.redParensInteger',
    pattern: '#,##0_);[Red](#,##0)',
    numberFormat: { kind: 'number', digits: 0, thousands: true, negative: 'red-parens' },
  },
  {
    id: 'parens-decimal',
    exampleKey: 'numberFormatDialog.number.example.parensDecimal',
    pattern: '#,##0.00_);(#,##0.00)',
    numberFormat: { kind: 'number', digits: 2, thousands: true, negative: 'parens' },
  },
  {
    id: 'red-parens-decimal',
    exampleKey: 'numberFormatDialog.number.example.redParensDecimal',
    pattern: '#,##0.00_);[Red](#,##0.00)',
    numberFormat: { kind: 'number', digits: 2, thousands: true, negative: 'red-parens' },
  },
  {
    id: 'currency-parens-integer',
    exampleKey: 'numberFormatDialog.number.example.currencyParensInteger',
    pattern: '$#,##0_);($#,##0)',
    numberFormat: { kind: 'currency', symbol: '$', digits: 0, negative: 'parens' },
  },
  {
    id: 'currency-red-parens-integer',
    exampleKey: 'numberFormatDialog.number.example.currencyRedParensInteger',
    pattern: '$#,##0_);[Red]($#,##0)',
    numberFormat: { kind: 'currency', symbol: '$', digits: 0, negative: 'red-parens' },
  },
  {
    id: 'currency-parens-decimal',
    exampleKey: 'numberFormatDialog.number.example.currencyParensDecimal',
    pattern: '$#,##0.00_);($#,##0.00)',
    numberFormat: { kind: 'currency', symbol: '$', digits: 2, negative: 'parens' },
  },
  {
    id: 'currency-red-parens-decimal',
    exampleKey: 'numberFormatDialog.number.example.currencyRedParensDecimal',
    pattern: '$#,##0.00_);[Red]($#,##0.00)',
    numberFormat: { kind: 'currency', symbol: '$', digits: 2, negative: 'red-parens' },
  },
  {
    id: 'text',
    exampleKey: 'numberFormatDialog.number.example.text',
    pattern: '@',
    numberFormat: { kind: 'text' },
  },
  {
    id: 'percent',
    exampleKey: 'numberFormatDialog.number.example.percent',
    pattern: '0%',
    numberFormat: { kind: 'percent', digits: 0 },
  },
  {
    id: 'percent-decimal',
    exampleKey: 'numberFormatDialog.number.example.percentDecimal',
    pattern: '0.00%',
    numberFormat: { kind: 'percent', digits: 2 },
  },
  {
    id: 'scientific',
    exampleKey: 'numberFormatDialog.number.example.scientific',
    pattern: '0.00E+00',
    numberFormat: { kind: 'scientific', digits: 2 },
  },
  {
    id: 'scientific-short',
    exampleKey: 'numberFormatDialog.number.example.scientificShort',
    pattern: '##0.0E+0',
    numberFormat: { kind: 'scientific', digits: 1 },
  },
  {
    id: 'fraction-one',
    exampleKey: 'numberFormatDialog.number.example.fractionOne',
    pattern: '# ?/?',
    numberFormat: { kind: 'fraction', denominator: 'one-digit' },
  },
  {
    id: 'fraction-two',
    exampleKey: 'numberFormatDialog.number.example.fractionTwo',
    pattern: '# ??/??',
    numberFormat: { kind: 'fraction', denominator: 'two-digit' },
  },
  {
    id: 'accounting-cny',
    exampleKey: 'numberFormatDialog.number.example.accountingCny',
    pattern: '_ ¥#,##0_ ;_ ¥-#,##0_ ;_ ¥"-"_ ;_ @_ ',
    numberFormat: { kind: 'accounting', symbol: '¥', digits: 0 },
  },
  {
    id: 'accounting',
    exampleKey: 'numberFormatDialog.number.example.accounting',
    pattern: '_ #,##0_ ;_ -#,##0_ ;_ "-"_ ;_ @_ ',
    numberFormat: { kind: 'accounting', symbol: '', digits: 0 },
  },
  {
    id: 'accounting-cny-decimal',
    exampleKey: 'numberFormatDialog.number.example.accountingCnyDecimal',
    pattern: '_ ¥#,##0.00_ ;_ ¥-#,##0.00_ ;_ ¥"-"??_ ;_ @_ ',
    numberFormat: { kind: 'accounting', symbol: '¥', digits: 2 },
  },
  {
    id: 'accounting-decimal',
    exampleKey: 'numberFormatDialog.number.example.accountingDecimal',
    pattern: '_ #,##0.00_ ;_ -#,##0.00_ ;_ "-"??_ ;_ @_ ',
    numberFormat: { kind: 'accounting', symbol: '', digits: 2 },
  },
]
