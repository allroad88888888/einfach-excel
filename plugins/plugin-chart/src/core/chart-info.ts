import type { DrawingAnchor, SheetDrawing } from '@einfach-excel/spreadsheet-ui-core'
import { formatRangesText, type SheetDirectory } from './range-text'
import { parseChartSpec, type ChartSpec } from './spec'

/** 宿主看到的一张图表；数据区域用 A1 文本（其他表带表名），被删光的区域写成 #REF!。 */
export interface ChartInfo {
  readonly id: string
  readonly sheetId: string
  readonly data: string
  readonly anchor: DrawingAnchor
  readonly spec: ChartSpec
}

export function chartInfo(sheetId: string, drawing: SheetDrawing,
  sheets: SheetDirectory['sheets']): ChartInfo {
  return { id: drawing.id, sheetId,
    data: formatRangesText(drawing.refs, { sheets, ownerId: sheetId }),
    anchor: drawing.anchor, spec: parseChartSpec(drawing.payload) }
}
