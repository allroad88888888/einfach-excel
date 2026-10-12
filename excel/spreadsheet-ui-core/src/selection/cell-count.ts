import { atom } from '@einfach/core'
import { getSelectionRange, selectionBoundsAtom, selectionRegionsAtom } from './index'
import type { CellRange } from '../shared'

/** 只计算 UI 选区几何。行边界之间的覆盖不变，不展开任何单元格或读取工作簿值。 */
export function countSelectionCells(ranges: readonly CellRange[]): number {
  const rows = [...new Set(ranges.flatMap((r) => [r.rowStart, r.rowEnd + 1]))]
    .sort((a, b) => a - b)
  let count = 0
  for (let index = 0; index + 1 < rows.length; index++) {
    const row = rows[index]
    const spans = ranges.filter((r) => r.rowStart <= row && r.rowEnd >= row)
      .map((r) => [r.colStart, r.colEnd + 1] as const).sort((a, b) => a[0] - b[0])
    let width = 0
    let end = -1
    for (const [start, nextEnd] of spans) {
      width += Math.max(0, nextEnd - Math.max(start, end))
      end = Math.max(end, nextEnd)
    }
    count += (rows[index + 1] - row) * width
  }
  return count
}

/** 不保存第二份计数；重复/交叉区域只计一次，不同表的同一坐标分别计数。 */
export const selectionCellCountAtom = atom((get) => {
  const bounds = get(selectionBoundsAtom)
  const sheets = new Map<string, CellRange[]>()
  for (const region of get(selectionRegionsAtom)) {
    const ranges = sheets.get(region.sheetId) ?? []
    ranges.push(getSelectionRange(region, bounds))
    sheets.set(region.sheetId, ranges)
  }
  return [...sheets.values()].reduce((total, ranges) => total + countSelectionCells(ranges), 0)
})
