import type { SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { DatePicker } from './DatePicker'
import { messages } from './messages'

export const datePickerPlugin: SpreadsheetPlugin = {
  id: 'date-picker', editorAdornments: [DatePicker], messages,
}
