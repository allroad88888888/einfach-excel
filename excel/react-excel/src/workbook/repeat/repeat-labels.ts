import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { RepeatLabel } from '@einfach-excel/spreadsheet-ui-core'

/** 提示里的动作名；键由 UI Core 的 RepeatLabel 约束，漏写会编译失败。 */
export const REPEAT_LABELS: Readonly<Record<RepeatLabel, MessageDescriptor>> = {
  bold: msg`Bold`,
  italic: msg`Italic`,
  underline: msg`Underline`,
  strikethrough: msg`Strikethrough`,
  'wrap-text': msg`Wrap text`,
  'fill-color': msg`Fill color`,
  'text-color': msg`Text color`,
  'font-family': msg`Font`,
  'font-size': msg`Font size`,
  alignment: msg`Alignment`,
  'number-format': msg`Number format`,
  borders: msg`Borders`,
  indent: msg`Indent`,
  format: msg`Formatting`,
  'clear-contents': msg`Clear contents`,
  'clear-formats': msg`Clear formatting`,
  'clear-all': msg`Clear all`,
  'insert-rows': msg`Insert rows`,
  'insert-columns': msg`Insert columns`,
  'delete-rows': msg`Delete rows`,
  'delete-columns': msg`Delete columns`,
  merge: msg`Merge cells`,
  center: msg`Merge and center`,
  unmerge: msg`Unmerge cells`,
  'row-height': msg`Row height`,
  'column-width': msg`Column width`,
  'hide-rows': msg`Hide rows`,
  'hide-columns': msg`Hide columns`,
  unhide: msg`Unhide`,
  'unhide-all': msg`Unhide all`,
}
