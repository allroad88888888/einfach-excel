import type { AutoFitLayout } from '@einfach/spreadsheet-ui-core'

/** 只量一个无格式的临时格，避免把可见格的字体当成整表默认值。 */
export function readAutoFitLayout(handle: HTMLElement): AutoFitLayout | null {
  const surface = handle.closest('.sheet-grid-frame')?.querySelector('.grid-surface')
  if (!surface) return null
  const table = document.createElement('table')
  table.className = 'spreadsheet-grid'
  table.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;'
  const row = table.insertRow()
  const cell = row.insertCell()
  cell.className = 'cell'
  row.insertCell() // 不触发 last-child 的去右边框规则。
  surface.append(table)
  try {
    const style = getComputedStyle(cell)
    const px = (value: string) => Number.parseFloat(value)
    return {
      fontFamily: style.fontFamily,
      fontSize: px(style.fontSize),
      lineHeight: px(style.lineHeight),
      paddingTop: px(style.paddingTop),
      paddingBottom: px(style.paddingBottom),
      paddingLeft: px(style.paddingLeft),
      paddingRight: px(style.paddingRight),
      borderTop: px(style.borderTopWidth),
      borderBottom: px(style.borderBottomWidth),
      borderLeft: px(style.borderLeftWidth),
      borderRight: px(style.borderRightWidth),
    }
  } finally {
    table.remove()
  }
}
