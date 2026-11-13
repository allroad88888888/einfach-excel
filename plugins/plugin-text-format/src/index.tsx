import type { SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { FontBaselineTools } from './FontBaselineTools'
import { messages } from './messages'

export const textFormatPlugin: SpreadsheetPlugin = {
  id: 'text-format',
  ribbonItems: [{ id: 'font-baseline', after: 'format.decrease-font-size', Item: FontBaselineTools }],
  messages,
}
