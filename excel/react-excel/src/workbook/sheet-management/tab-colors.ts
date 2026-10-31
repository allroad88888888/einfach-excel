import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

/** 页签颜色调色板；值是写入工作簿的 #RRGGBB，名称只用于无障碍和提示。 */
export const TAB_COLORS: readonly { readonly value: string; readonly name: MessageDescriptor }[] = [
  { value: '#C00000', name: msg`Dark red` },
  { value: '#FF0000', name: msg`Red` },
  { value: '#FFC000', name: msg`Orange` },
  { value: '#FFFF00', name: msg`Yellow` },
  { value: '#92D050', name: msg`Light green` },
  { value: '#00B050', name: msg`Green` },
  { value: '#00B0F0', name: msg`Light blue` },
  { value: '#0070C0', name: msg`Blue` },
  { value: '#002060', name: msg`Dark blue` },
  { value: '#7030A0', name: msg`Purple` },
]
