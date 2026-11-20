import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

export const internalHyperlinkFeedback: Readonly<Record<string, MessageDescriptor>> = {
  'Enter a valid workbook location such as #Sheet2!A1 or #DefinedName.':
    msg`Enter a valid workbook location such as #Sheet2!A1 or #DefinedName.`,
  'The linked worksheet or named range does not exist.':
    msg`The linked worksheet or named range does not exist.`,
  'The linked worksheet is hidden. Unhide it before opening this link.':
    msg`The linked worksheet is hidden. Unhide it before opening this link.`,
  'The linked cell or range is outside the worksheet canvas.':
    msg`The linked cell or range is outside the worksheet canvas.`,
  'No floating objects found on this worksheet.':
    msg`No floating objects found on this worksheet.`,
  'Selected 1 floating object.':
    msg`Selected 1 floating object.`,
}
