import type { SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { FontBaselineTools } from './FontBaselineTools'
import { RichTextBaselineTools } from './RichTextBaselineTools'
import { ShrinkToFitTools } from './ShrinkToFitTools'
import { messages } from './messages'

export const textFormatPlugin: SpreadsheetPlugin = {
  id: 'text-format',
  ribbonItems: [
    { id: 'font-baseline', after: 'format.decrease-font-size', Item: FontBaselineTools },
    { id: 'shrink-to-fit', after: 'format.wrap-text', Item: ShrinkToFitTools },
  ],
  richTextTools: [{ id: 'font-baseline', Item: RichTextBaselineTools }],
  messages,
}
