import type { SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { TopFilterFields } from './TopFilterFields'
import { labels, messages } from './messages'
import './filter.css'

export const dataFilterPlugin: SpreadsheetPlugin = {
  id: 'data-filter',
  filterConditions: [{ kind: 'top', label: labels.title, Editor: TopFilterFields }],
  messages,
}
