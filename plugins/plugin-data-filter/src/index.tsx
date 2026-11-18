import type { SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { TopFilterFields } from './TopFilterFields'
import { DatePeriodFields } from './DatePeriodFields'
import { dateLabels, dateMessages } from './date-messages'
import { labels, messages } from './messages'
import './filter.css'

export const dataFilterPlugin: SpreadsheetPlugin = {
  id: 'data-filter',
  filterConditions: [
    { kind: 'top', label: labels.title, Editor: TopFilterFields },
    { kind: 'date-period', label: dateLabels.title, Editor: DatePeriodFields },
  ],
  messages: {
    en: { ...messages.en, ...dateMessages.en }, zh: { ...messages.zh, ...dateMessages.zh },
  },
}
