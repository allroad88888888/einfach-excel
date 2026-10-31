import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

/** 拖动选区边框移动／复制在 Core 里新增的提示；原生拒绝原因沿用剪贴板词典。 */
export const dragMoveFeedback: Readonly<Record<string, MessageDescriptor>> = {
  'The workbook changed. Drag the cells again.': msg`The workbook changed. Drag the cells again.`,
  'Invalid drag move acknowledgement.': msg`Invalid drag move acknowledgement.`,
  'Rust drag move is unavailable.': msg`Rust drag move is unavailable.`,
}
