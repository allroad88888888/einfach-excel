import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

export const richTextFeedback: Readonly<Record<string, MessageDescriptor>> = {
  'Rich text exceeds the cell size limit.': msg`Rich text exceeds the cell size limit.`,
  'Invalid rich text format.': msg`Invalid rich text format.`,
  'Rich text colors must use #RRGGBB.': msg`Rich text colors must use #RRGGBB.`,
  'Rich text must match the cell\'s literal text.': msg`Rich text must match the cell's literal text.`,
  'Select the anchor cell before editing rich text.': msg`Select the anchor cell before editing rich text.`,
  'Rich text editing is unavailable inside a table.': msg`Rich text editing is unavailable inside a table.`,
  'Could not update rich text.': msg`Could not update rich text.`,
  'The workbook changed. Reopen the rich text editor.': msg`The workbook changed. Reopen the rich text editor.`,
  'Finish the current operation before editing rich text.': msg`Finish the current operation before editing rich text.`,
  'Rust returned a mismatched rich text result.': msg`Rust returned a mismatched rich text result.`,
  'Rust rich text editing is unavailable.': msg`Rust rich text editing is unavailable.`,
  'The rich text cell is outside the worksheet.': msg`The rich text cell is outside the worksheet.`,
  'Invalid rich text projection request.': msg`Invalid rich text projection request.`,
  CALCULATION_SUSPENDED: msg`Resume calculation before recalculating.`,
}
