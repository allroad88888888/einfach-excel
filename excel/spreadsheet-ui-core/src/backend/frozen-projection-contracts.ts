import type { CellRange } from '../shared'
import type { DisplayCell } from './projection-primitives'
import type { ViewportRowHeight, ViewportColumnWidth } from './viewport-contracts'

/** 数据区域的实测像素，不包含行号栏与列标题；不携带工作簿配置。 */
export interface ProjectionViewport {
  height: number
  width: number
  rowHeight: number
  colWidth: number
}

/** 隐藏行列把一个窗格切成若干连续读取块，避免扫描隐藏的巨大矩形。 */
export interface FrozenProjectionRegion {
  pane: 'top' | 'left' | 'corner'
  window: CellRange
  cells: DisplayCell[]
  mergeAnchors?: DisplayCell[]
  rowHeights?: ViewportRowHeight[]
  colWidths?: ViewportColumnWidth[]
}

export interface FrozenProjection {
  /** 完整冻结带的像素尺寸；渲染时按 viewport 裁剪。 */
  height: number
  width: number
  regions: FrozenProjectionRegion[]
}
