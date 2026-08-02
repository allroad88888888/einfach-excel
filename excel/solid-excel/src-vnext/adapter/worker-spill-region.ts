/**
 * 「这一格属于哪个动态数组」的**纯**扫描 —— 给没有溢出索引的引擎用。
 *
 * WASM 引擎在目标格上真的挂了派生 atom，所以它有 `spillAnchor` 反查索引，走
 * `worker-commands-spill.ts`。TS 参考引擎不挂：溢出目标在表里根本没有条目，值是读的
 * 时候从锚点投影出来的，所以只能反着往左上找锚点。本模块就是那次查找，与投影读用的
 * `getSpillProjectedValue` **同一形状、同一 lookback 上限**，两者不许有分歧。
 */

export interface SpillProbeShape {
  rows: number
  cols: number
}

export interface SpillProbe {
  /** 这一格有没有自己的内容（字面量或公式）。有自己的内容就遮住溢出。 */
  hasOwnCell(row: number, col: number): boolean
  /** 这一格自己的值是不是数组；是就给形状，否则 `null`（含非公式格）。 */
  arrayShapeAt(row: number, col: number): SpillProbeShape | null
}

export interface SpillRegionScanResult {
  anchorRow: number
  anchorCol: number
  rows: number
  cols: number
}

/**
 * 往左上回看的格数上限。与 `worker-runtime-ts.ts` 的 `SPILL_LOOKBACK` 是同一个数：
 * 超过这个距离的锚点，投影读本身也不认，边框自然也不该画。
 */
export const SPILL_SCAN_LOOKBACK = 200

export function resolveSpillRegion(
  probe: SpillProbe,
  row: number,
  col: number,
  lookback: number = SPILL_SCAN_LOOKBACK,
): SpillRegionScanResult | null {
  // 有自己的内容 → 只可能是锚点本身，不可能是别人的投影目标。
  if (probe.hasOwnCell(row, col)) {
    const shape = probe.arrayShapeAt(row, col)
    if (!shape) return null
    return { anchorRow: row, anchorCol: col, rows: shape.rows, cols: shape.cols }
  }

  const rowMin = Math.max(0, row - lookback)
  const colMin = Math.max(0, col - lookback)
  for (let r = row; r >= rowMin; r -= 1) {
    for (let c = col; c >= colMin; c -= 1) {
      if (r === row && c === col) continue
      if (!probe.hasOwnCell(r, c)) continue
      const shape = probe.arrayShapeAt(r, c)
      if (!shape) continue
      // 锚点存在但它的数组盖不到我们 —— 继续找更外面的锚点。
      if (row - r < shape.rows && col - c < shape.cols) {
        return { anchorRow: r, anchorCol: c, rows: shape.rows, cols: shape.cols }
      }
    }
  }
  return null
}
