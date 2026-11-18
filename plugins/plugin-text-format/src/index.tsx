import type { SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { FontBaselineTools } from './FontBaselineTools'
import { RichTextBaselineTools } from './RichTextBaselineTools'
import { messages } from './messages'

export const textFormatPlugin: SpreadsheetPlugin = {
  id: 'text-format',
  ribbonItems: [{ id: 'font-baseline', after: 'format.decrease-font-size', Item: FontBaselineTools }],
  richTextTools: [{ id: 'font-baseline', Item: RichTextBaselineTools }],
  messages,
}
