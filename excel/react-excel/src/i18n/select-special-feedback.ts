import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

/** 仅可见单元格、当前区域与多块复制的固定提示。 */
export const selectSpecialFeedback: Readonly<Record<string, MessageDescriptor>> = {
  'No visible cells in the selection.': msg`No visible cells in the selection.`,
  'Selected current region.': msg`Selected current region.`,
  'The worksheet changed. Try again.': msg`The worksheet changed. Try again.`,
  'The selection changed. Try again.': msg`The selection changed. Try again.`,
  'The workbook changed. Try again.': msg`The workbook changed. Try again.`,
  'The native result is outside the worksheet.': msg`The native result is outside the worksheet.`,
  'The native result is inconsistent.': msg`The native result is inconsistent.`,
  CLIPBOARD_MULTI_SHAPE: msg`This command cannot be used on multiple selections. Select areas with the same rows or columns.`,
  CLIPBOARD_MULTI_CUT: msg`Cut cannot be used on multiple selections. Copy instead.`,
}
