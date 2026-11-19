import type { SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { CustomListSortTools } from './CustomListSortTools'
import { CustomListSortDialog } from './CustomListSortDialog'
import { ColorSortDialog } from './ColorSortDialog'
import { ColorSortTools } from './ColorSortTools'
import { messages } from './messages'

export const dataSortPlugin: SpreadsheetPlugin = {
  id: 'data-sort',
  ribbonItems: [
    { id: 'custom-list', after: 'data.sort-selected-range', Item: CustomListSortTools },
    { id: 'color-sort', after: 'data.sort-selected-range', Item: ColorSortTools },
  ],
  panels: [CustomListSortDialog, ColorSortDialog],
  messages,
}
