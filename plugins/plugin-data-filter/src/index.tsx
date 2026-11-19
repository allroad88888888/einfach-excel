import type { SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { TopFilterFields } from './TopFilterFields'
import { DatePeriodFields } from './DatePeriodFields'
import { dateLabels, dateMessages } from './date-messages'
import { labels, messages } from './messages'
import { ColorFields } from './ColorFields'
import { colorLabels, colorMessages } from './color-messages'
import { WorksheetCriteriaDialog } from './WorksheetCriteriaDialog'
import { WorksheetCriteriaTools } from './WorksheetCriteriaTools'
import { worksheetCriteriaMessages } from './worksheet-criteria-messages'
import './filter.css'
import './color.css'

export const dataFilterPlugin: SpreadsheetPlugin = {
  id: 'data-filter',
  ribbonItems: [{ id: 'worksheet-criteria', after: 'data.worksheet-filter', Item: WorksheetCriteriaTools }],
  panels: [WorksheetCriteriaDialog],
  filterConditions: [
    { kind: 'top', label: labels.title, Editor: TopFilterFields },
    { kind: 'date-period', label: dateLabels.title, Editor: DatePeriodFields },
    { kind: 'color', label: colorLabels.title, Editor: ColorFields },
  ],
  messages: {
    en: {
      ...messages.en, ...dateMessages.en, ...colorMessages.en, ...worksheetCriteriaMessages.en,
    },
    zh: {
      ...messages.zh, ...dateMessages.zh, ...colorMessages.zh, ...worksheetCriteriaMessages.zh,
    },
  },
}
