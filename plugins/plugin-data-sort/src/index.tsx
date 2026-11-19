import type { SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { CustomListSortTools } from './CustomListSortTools'
import { CustomListSortDialog } from './CustomListSortDialog'
import { VisualSortDialog } from './VisualSortDialog'
import { ColorSortTools, IconSortTools, HorizontalSortTools } from './VisualSortTools'
import { messages } from './messages'

export const dataSortPlugin: SpreadsheetPlugin = {
  id: 'data-sort',
  ribbonItems: [
    { id: 'custom-list', after: 'data.sort-selected-range', Item: CustomListSortTools },
    { id: 'color-sort', after: 'data.sort-selected-range', Item: ColorSortTools },
    { id: 'icon-sort', after: 'data.sort-selected-range', Item: IconSortTools },
    { id: 'left-to-right', after: 'data.sort-selected-range', Item: HorizontalSortTools },
  ],
  panels: [CustomListSortDialog, VisualSortDialog],
  messages,
}
