import type { SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { TopFilterFields } from './TopFilterFields'
import { DatePeriodFields } from './DatePeriodFields'
import { dateLabels, dateMessages } from './date-messages'
import { labels, messages } from './messages'
import { ColorFields } from './ColorFields'
import { colorLabels, colorMessages } from './color-messages'
import './filter.css'
import './color.css'

export const dataFilterPlugin: SpreadsheetPlugin = {
  id: 'data-filter',
  filterConditions: [
    { kind: 'top', label: labels.title, Editor: TopFilterFields },
    { kind: 'date-period', label: dateLabels.title, Editor: DatePeriodFields },
    { kind: 'color', label: colorLabels.title, Editor: ColorFields },
  ],
  messages: {
    en: { ...messages.en, ...dateMessages.en, ...colorMessages.en },
    zh: { ...messages.zh, ...dateMessages.zh, ...colorMessages.zh },
  },
}
