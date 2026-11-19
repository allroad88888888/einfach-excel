import type { SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { SubtotalDialog } from './SubtotalDialog'
import { SubtotalTools } from './SubtotalTools'
import { subtotalMessages } from './messages'

export const dataSubtotalPlugin: SpreadsheetPlugin = {
  id: 'data-subtotal',
  ribbonItems: [{ id: 'subtotal', after: 'data.remove-duplicates', Item: SubtotalTools }],
  panels: [SubtotalDialog],
  messages: subtotalMessages,
}
