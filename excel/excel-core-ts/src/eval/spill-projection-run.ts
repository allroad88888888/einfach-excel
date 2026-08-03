/**
 * 一件事：**一次求值运行内的投影账本**。
 *
 * `spill-projection.ts` 只管几何（谁盖住谁、投影出什么标量），它每问一次就扫一遍
 * `cells`。一条公式在一次求值里会问很多次（`=A2+A3+A4` 三次、区域物化一次、稀疏
 * 聚合一次），所以这里加两件事：
 *
 *  1. **本轮备忘录** —— 同一个查询矩形在一次 trampoline 运行内只扫一遍。它只活在
 *     那一次运行里（`cells` 在这期间不会变），运行结束整体丢弃：不是常驻索引，
 *     没有失效时机，也不可能给出过期答案。
 *  2. **运行期依赖收集** —— 记下本帧考虑过的候选锚点的外接矩形。读投影值的公式
 *     必须依赖锚点，否则锚点重算/被清掉时它收不到消息：它的静态依赖指向投影格
 *     自己，而投影格在表里没有条目，谁写它都与锚点无关。
 *
 * 跨表路由也在这里：`sheetName` 交给 `cellsFor` 换成那张表的 `cells`。
 */

import type { Cell, CellCoord, CellKey, CellRange, Value } from '../types'
import {
  NO_SPILL_ANCHORS,
  projectedValueAt,
  scanSpillAnchors,
  type SpillAnchorScan,
  type SpillAnchorSource,
} from './spill-projection'

export interface SpillProjectionRun {
  /** 扫一次 `query`；同一个 `query` 在本轮内只扫一遍。 */
  scan(sheetName: string | undefined, query: CellRange): SpillAnchorScan
  /** 单地址捷径：`coord` 上的投影值，没有锚点盖住 → `undefined`。 */
  at(sheetName: string | undefined, coord: CellCoord): Value | undefined
  /** 清空「本帧考虑过的候选矩形」。trampoline 每次重跑一帧前调一次。 */
  resetWatches(): void
  /** 本帧考虑过的候选矩形，调用方登记成运行期区域依赖。 */
  watches(): ReadonlyArray<{ readonly sheetName?: string; readonly range: CellRange }>
}

export function createSpillProjectionRun(deps: {
  cellsFor(sheetName: string | undefined): ReadonlyMap<CellKey, Cell> | undefined
  sourceFor(cells: ReadonlyMap<CellKey, Cell>): SpillAnchorSource
}): SpillProjectionRun {
  const memo = new Map<string, SpillAnchorScan>()
  let collected: Array<{ sheetName?: string; range: CellRange }> = []

  const scan = (sheetName: string | undefined, query: CellRange): SpillAnchorScan => {
    const memoKey =
      `${sheetName ?? ''}|${query.rowStart}:${query.colStart}:${query.rowEnd}:${query.colEnd}`
    const cached = memo.get(memoKey)
    if (cached !== undefined) {
      if (cached.watch) collected.push({ sheetName, range: cached.watch })
      return cached
    }
    const cells = deps.cellsFor(sheetName)
    if (!cells) return NO_SPILL_ANCHORS
    const source = deps.sourceFor(cells)
    // 扫描要么算完、要么由 `settle` 抛 `NeedsDep` 中止 —— 半成品不会走到这里。
    const result = scanSpillAnchors(query, cells, source)
    // 跳过了求值栈上的候选 ⇒ 同一个查询稍后可能有别的答案，不许记。
    if (source.unstable?.() !== true) memo.set(memoKey, result)
    if (result.watch) collected.push({ sheetName, range: result.watch })
    return result
  }

  return {
    scan,
    at: (sheetName, coord) =>
      projectedValueAt(
        scan(sheetName, {
          rowStart: coord.row,
          rowEnd: coord.row,
          colStart: coord.col,
          colEnd: coord.col,
        }),
        coord,
      ),
    resetWatches: () => {
      collected = []
    },
    watches: () => collected,
  }
}
