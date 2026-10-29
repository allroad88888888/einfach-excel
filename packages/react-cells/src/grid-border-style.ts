import type { CSSProperties } from 'react'
import { createCellBorderResolver } from '@einfach-excel/spreadsheet-ui-core'
import { cellFormatStyle } from './cell-format-style'

export { sharedBorder } from '@einfach-excel/spreadsheet-ui-core'

/** React 只把共享的共边归属结果转换成 CSS。 */
export function createGridBorderStyles(input: Parameters<typeof createCellBorderResolver>[0]) {
  const resolve = createCellBorderResolver(input)
  return (...args: Parameters<typeof resolve>): CSSProperties => {
    const { borders, suppressTop, suppressLeft } = resolve(...args)
    return {
      ...cellFormatStyle({ borders }),
      ...(suppressTop ? { borderTopWidth: '0px' } : {}),
      ...(suppressLeft ? { borderLeftWidth: '0px' } : {}),
    }
  }
}
