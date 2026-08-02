import type { CellCoord, CellRange, SheetRef } from '../shared'

/**
 * 一次溢出区查询：问「(row, col) 这一格属不属于某个活动的动态数组」。
 *
 * 刻意做成**按需查询**而不是挂在 `DisplayCell` 上：Excel 的溢出边框只在选区
 * 落进数组里时才出现，所以每次选区移动查一次就够，可见窗口里每格多带两个字段
 * 是纯浪费。取舍见 `README.md`「为什么不走可见窗口投影」。
 */
export interface SpillRegionRequest extends SheetRef {
  kind: 'spill-region'
  row: number
  col: number
  requestId?: number
  revision?: number | string
}

/** 一个活动溢出区：锚点坐标 + 含锚点在内的外接矩形。 */
export interface SpillRegion {
  /** 数组公式真正所在的格子。矩形的左上角恒等于它。 */
  anchor: CellCoord
  /** 溢出区外接矩形，含锚点。 */
  range: CellRange
}

export interface SpillRegionResult extends SheetRef {
  kind: 'spill-region'
  /**
   * 查询坐标不落在任何**活动**溢出区里时为 `null`。碰撞态（`#SPILL!`）锚点也是
   * `null` —— 它一个格子都没装上，Excel 同样不给它画边框。
   */
  region: SpillRegion | null
  requestId?: number
  revision?: number | string
}

/** 当前高亮的溢出区 —— 比 `SpillRegion` 多一个「属于哪张表」。 */
export interface ActiveSpillRegion extends SpillRegion, SheetRef {}

/** 一格在溢出区里的身份：锚点，还是从锚点溢出来的投影格。 */
export type SpillCellRole = 'anchor' | 'projected'
