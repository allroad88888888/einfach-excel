// 一句话：提供 POC 的固定可见窗口，不读取或观察 DOM 尺寸。

import type { CellRange } from '@einfach/spreadsheet-ui-core'

const DEFAULT_VISIBLE_WINDOW: CellRange = {
  rowStart: 0,
  rowEnd: 9,
  colStart: 0,
  colEnd: 4,
}

export function createFixedProjectionWindow(window?: CellRange): CellRange {
  const source = window ?? DEFAULT_VISIBLE_WINDOW
  return {
    rowStart: source.rowStart,
    rowEnd: source.rowEnd,
    colStart: source.colStart,
    colEnd: source.colEnd,
  }
}
