import type { SpreadsheetNumberFormat } from '@einfach/spreadsheet-ui-core'

/** Stable command ids understood by the toolbar runtime. */
export type NumberFormatId =
  | 'Auto'
  | 'Text'
  | 'Number'
  | 'Percent'
  | 'Scientific'
  | 'NumberThousands'
  | 'Accounting'
  | 'WanYuan'
  | 'Currency'
  | 'DateShort'
  | 'DateLong'
  | 'Time12'
  | 'Time24'
  | 'DateTime12'
  | 'DateTime24'
  | 'Custom'

export interface NumberFormatDropdownItem {
  readonly id: NumberFormatId
  readonly labelKey: string
  readonly preview: string
  readonly disabled?: boolean
}

export type NumberFormatCustomMenuId = 'currency' | 'dateTime' | 'number'

export const NUMBER_FORMAT_ITEMS: readonly NumberFormatDropdownItem[] = [
  { id: 'Auto', labelKey: 'numberFormatDropdown.auto', preview: '' },
  { id: 'Text', labelKey: 'numberFormatDropdown.text', preview: '' },
  { id: 'Number', labelKey: 'numberFormatDropdown.number', preview: '1000.12' },
  { id: 'Percent', labelKey: 'numberFormatDropdown.percent', preview: '12.21%' },
  { id: 'Scientific', labelKey: 'numberFormatDropdown.scientific', preview: '1.01E+5' },
  {
    id: 'NumberThousands',
    labelKey: 'numberFormatDropdown.numberThousands',
    preview: '1,234.56',
  },
  { id: 'Accounting', labelKey: 'numberFormatDropdown.accounting', preview: '¥1,234.56' },
  { id: 'WanYuan', labelKey: 'numberFormatDropdown.wanYuan', preview: '1.2', disabled: true },
  { id: 'Currency', labelKey: 'numberFormatDropdown.currency', preview: '¥1200.09' },
  { id: 'DateShort', labelKey: 'numberFormatDropdown.dateShort', preview: '2017-11-29' },
  { id: 'DateLong', labelKey: 'numberFormatDropdown.dateLong', preview: '1930年8月5日' },
  { id: 'Time12', labelKey: 'numberFormatDropdown.time12', preview: '3:00 PM' },
  { id: 'Time24', labelKey: 'numberFormatDropdown.time24', preview: '15:00' },
  {
    id: 'DateTime12',
    labelKey: 'numberFormatDropdown.dateTime12',
    preview: '2017-11-29 3:00 PM',
  },
  {
    id: 'DateTime24',
    labelKey: 'numberFormatDropdown.dateTime24',
    preview: '2017-11-29 15:00',
  },
  { id: 'Custom', labelKey: 'numberFormatDropdown.custom', preview: '' },
]

function normalizedPattern(pattern: string | undefined): string {
  return (pattern ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function isLongDate(pattern: string): boolean {
  return /[年月日]/.test(pattern) || /(?:mmmm|mmm|dddd|ddd)/.test(pattern)
}

/** Maps the Core format fact onto the closest toolbar shortcut row. */
export function numberFormatIdForFormat(
  format: SpreadsheetNumberFormat | null | undefined,
): NumberFormatId {
  if (!format || format.kind === 'general') return 'Auto'

  switch (format.kind) {
    case 'text':
      return 'Text'
    case 'number':
    case 'decimal':
      return format.thousands ? 'NumberThousands' : 'Number'
    case 'percent':
    case 'percentage':
      return 'Percent'
    case 'scientific':
      return 'Scientific'
    case 'accounting':
      return 'Accounting'
    case 'currency':
      return 'Currency'
    case 'date':
      return isLongDate(normalizedPattern(format.pattern)) ? 'DateLong' : 'DateShort'
    case 'time':
      return normalizedPattern(format.pattern).includes('am/pm') ? 'Time12' : 'Time24'
    case 'custom': {
      const pattern = normalizedPattern(format.pattern)
      if (pattern === 'yyyy-mm-dd h:mm am/pm') return 'DateTime12'
      if (pattern === 'yyyy-mm-dd hh:mm') return 'DateTime24'
      return 'Custom'
    }
    case 'fraction':
    case 'special':
      return 'Custom'
  }
}
