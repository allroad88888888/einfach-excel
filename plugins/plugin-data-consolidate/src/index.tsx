import type { SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { ConsolidateDialog } from './ConsolidateDialog'
import { ConsolidateTools } from './ConsolidateTools'
import { consolidateMessages } from './messages'

export const dataConsolidatePlugin: SpreadsheetPlugin = {
  id: 'data-consolidate',
  ribbonItems: [{ id: 'consolidate', after: 'data.remove-duplicates', Item: ConsolidateTools }],
  panels: [ConsolidateDialog],
  messages: consolidateMessages,
}
