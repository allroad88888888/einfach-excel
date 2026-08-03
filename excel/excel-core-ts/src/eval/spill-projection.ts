/**
 * 一件事：**一个地址上该显示/读到哪个锚点投影出来的标量**。
 *
 * 输入是「查询矩形 + 这张表的活单元格 + 一个取锚点数组的口子」，输出是「压到这个
 * 矩形上的那些锚点」。调用方拿它把一个地址翻成标量。
 *
 * ── 为什么需要它 ──
 *
 * TS 引擎的投影格是**虚**的：`A1 = =SEQUENCE(3)` 只在 `cells` 里留 A1 一条条目，
 * A2/A3 在表里根本不存在。于是公式层读 A2 读到空、`SUM(A1:A3)` 把 A1 那一格读成
 * **整个数组**（物化后行数对不上 → `#CALC!`）。Rust 引擎在溢出目标上挂了真的派生
 * atom，所以那边 `SUM(A1:A3)` = 6、`=A2` = 2。同一条公式两个引擎两个答案。
 *
 * 本模块把「投影」这件事从宿主的显示层下沉到引擎，让**读一个地址**这条路径统一
 * 回答两个问题：
 *
 *  1. 这一格有自有条目、且值是数组（它是锚点）→ 读到的是**左上角那个标量**，
 *     不是整个数组（Excel：`=A1+1` 在 `A1 = =SEQUENCE(3)` 上给 `2`，不是一片）。
 *     整片只能用 `A1#` 拿到，走 `spillRef` 那条路。
 *  2. 这一格没有自有条目 → 问「有没有哪个锚点的矩形盖住我」，有就返回投影值。
 *
 * ── 回看窗口 ──
 *
 * 反查「谁盖住了我」没有索引 —— 本仓禁止 per-cell / per-row / per-column 的旁路
 * 表（那种表会在锚点重算时腐坏，给出指向已被清空的格子的答案）。所以这里靠
 * **几何闸门**砍候选：锚点只向右下铺，因此它必须在查询矩形的左上方向；再加
 * `SPILL_PROJECTION_LOOKBACK` 这条产品级上限。
 *
 * 这个上限**不是本模块发明的** —— 宿主适配层
 * （`excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts`）从一开始就用同一个
 * 数做同一件事，只是做在显示层。下沉之后那一份改成薄委派，数只剩这一个。
 *
 * ── 代价 ──
 *
 * 每次查询扫一遍调用方喂进来的候选（求值器给整张表的 `cells` —— 稀疏，不是 1M
 * 格的矩形；宿主的显示边界给「回看象限 ∩ 已有格子」），几何闸门是纯算术；只有过
 * 了闸门的候选才会去问它的数组值，那一步可能触发一次求值。备忘录不在这里 ——
 * 求值器把每轮的扫描结果记在 `spill-projection-run.ts` 的账本上。
 *
 * 调用方还有一道更便宜的闸门在前面：矩形里**一个空洞都没有**时根本不用扫
 * （`evaluate.ts` 的 `rangeHasHole`）。密集区域因此零代价。
 */

import { EXCEL_MAX_COL, EXCEL_MAX_ROW } from '../refs'
import type { Cell, CellCoord, CellKey, CellRange, Value } from '../types'
import { BLANK } from '../types'

import { ARRAY_CELL_CAP } from './evaluate'

/**
 * 锚点能往右下投多远才还算得上「够得着」。
 *
 * 这是一条**产品级上限**，不是几何真相：`=SEQUENCE(100000)` 在 Excel 里铺满 10 万
 * 行，本引擎只承认前 `SPILL_PROJECTION_LOOKBACK` 行/列范围内的投影。取 200 是沿用
 * 宿主适配层已经在跑的那个数（见文件头），下沉后它是**唯一**一份。
 *
 * 放宽它是纯粹的代价问题（候选变多、可能被求值的候选也变多），不是正确性问题。
 */
export const SPILL_PROJECTION_LOOKBACK = 200

/** 一个压到查询矩形上的锚点。 */
export interface SpillAnchorHit {
  readonly coord: CellCoord
  readonly rows: number
  readonly cols: number
  readonly grid: ReadonlyArray<ReadonlyArray<Value>>
}

/** 一次扫描的结果。 */
export interface SpillAnchorScan {
  readonly anchors: ReadonlyArray<SpillAnchorHit>
  /**
   * 「锚点**可能**待的那一片」。调用方要把它登记成**运行期区域依赖** —— 否则读
   * 投影值的那条公式收不到锚点的消息：它的静态依赖指向投影格自己，而投影格在表
   * 里没有条目，谁写它都跟锚点无关。
   *
   * 这里给的是**回看象限**（查询矩形往左上扩 `SPILL_PROJECTION_LOOKBACK`），不是
   * 「这一遍看到的候选的外接矩形」。差别在于后者答不出**锚点还不存在**的那一刻：
   * `=A2` 在 A1 还空着时算过一次，之后往 A1 写 `=SEQUENCE(3)`，若只看住已有候选
   * 就没有任何一条边通知它 —— 同一条公式的答案会取决于两次写入的先后。
   *
   * 代价是多余重算：象限里任何一次写入都会让这条公式重跑。它被两件事托住 ——
   * 只有**真的读到空洞**的公式才登记（`rangeHasHole` 在调用方先挡一道），而且
   * 象限左上角被 0 夹住，靠近表头的公式拿到的是很小的一块。
   */
  readonly watch?: CellRange
}

/**
 * 候选锚点的取值口。本模块不持有状态、不缓存 —— 实现方（求值器 / 宿主）决定
 * 怎么算、怎么缓存、以及正在求值栈上的候选要不要回答。
 */
export interface SpillAnchorSource {
  /**
   * `cell` 作为锚点摊开成什么二维数组；不是锚点（值不是数组 / 还不能回答）→
   * `undefined`。
   */
  arrayAt(key: CellKey, cell: Cell): ReadonlyArray<ReadonlyArray<Value>> | undefined
  /**
   * 一遍扫完之后调用一次。求值器在这里把「还没算出来的候选」一次性抛给
   * trampoline（`NeedsDep`），所以本模块永远不会把**半成品**扫描结果交出去。
   */
  settle?(): void
  /**
   * 这一遍有没有跳过「正在求值栈上」的候选。跳过了就说明同样的查询在本轮稍后
   * 可能给出不同答案 —— 调用方不许把它记进备忘录。
   */
  unstable?(): boolean
}

const EMPTY_SCAN: SpillAnchorScan = { anchors: [] }

/**
 * 数组值被**当作单元格引用**读到时的标量：左上角那一个。
 *
 * 这是 Excel 语义的单点实现 —— `=A1+1`、`SUM(A1:A3)` 里的 A1、`ISNUMBER(A1)` 读到
 * 的都是这一个标量；整片只有 `A1#` 拿得到。WASM 边界上同一条规则写在
 * `excel/rust/wasm` 的单元格投影读里。
 */
export function anchorScalar(value: Value): Value {
  if (value.kind !== 'array') return value
  return value.value[0]?.[0] ?? BLANK
}

function coordFromKey(key: CellKey): CellCoord | undefined {
  const sep = key.indexOf(':')
  if (sep < 0) return undefined
  const row = Number(key.slice(0, sep))
  const col = Number(key.slice(sep + 1))
  if (!Number.isInteger(row) || !Number.isInteger(col)) return undefined
  return { row, col }
}

/**
 * `coord` 上的锚点**有没有可能**盖到查询矩形。纯几何、不求值。
 *
 * 三道闸门：只向右下铺（起点不能在矩形的右边或下边）、回看窗口、以及按引擎的
 * 数组上限算「够不够得着矩形的左上角」。三道都是**保守**的 —— 放宽只会多探几个
 * 候选，不会漏判。
 */
function couldReach(coord: CellCoord, query: CellRange): boolean {
  if (coord.row > query.rowEnd || coord.col > query.colEnd) return false
  if (query.rowStart - coord.row > SPILL_PROJECTION_LOOKBACK) return false
  if (query.colStart - coord.col > SPILL_PROJECTION_LOOKBACK) return false
  const needRows = Math.max(1, query.rowStart - coord.row + 1)
  const needCols = Math.max(1, query.colStart - coord.col + 1)
  return needRows * needCols <= ARRAY_CELL_CAP
}

/** `coord` 上一片 `rows × cols` 的数组与 `query` 相交吗。 */
function overlaps(coord: CellCoord, rows: number, cols: number, query: CellRange): boolean {
  return (
    coord.row <= query.rowEnd &&
    coord.col <= query.colEnd &&
    coord.row + rows - 1 >= query.rowStart &&
    coord.col + cols - 1 >= query.colStart
  )
}

/** 一格都不可能有锚点的查询（跑出表边）。 */
function queryOutOfSheet(query: CellRange): boolean {
  return (
    query.rowEnd < 0 ||
    query.colEnd < 0 ||
    query.rowStart > EXCEL_MAX_ROW ||
    query.colStart > EXCEL_MAX_COL
  )
}

/**
 * 找出所有**矩形压到 `query` 上**的锚点。
 *
 * 扫一遍 `candidates`：几何闸门先砍，过闸的才去问 `source.arrayAt`。候选必须是
 * 公式格，或者是被 `setCellValue` 直接塞进来的数组字面量 —— 别的值不可能铺开。
 *
 * `candidates` 取 `Iterable` 而不是 `Map`，因为调用方可能已经有更小的候选集：
 * 求值器丢整张表的 `cells`（稀疏，通常比回看窗口小），宿主的显示边界则丢
 * 「回看窗口 ∩ 已有格子」那一份枚举。少喂不会漏判 —— 只要喂进来的那份覆盖了
 * `couldReach` 认的那片左上象限。
 */
export function scanSpillAnchors(
  query: CellRange,
  candidates: Iterable<readonly [CellKey, Cell]>,
  source: SpillAnchorSource,
): SpillAnchorScan {
  if (queryOutOfSheet(query)) return EMPTY_SCAN
  let anchors: SpillAnchorHit[] | undefined
  const watch: CellRange = {
    rowStart: Math.max(0, query.rowStart - SPILL_PROJECTION_LOOKBACK),
    rowEnd: query.rowEnd,
    colStart: Math.max(0, query.colStart - SPILL_PROJECTION_LOOKBACK),
    colEnd: query.colEnd,
  }

  for (const [key, cell] of candidates) {
    if (cell.ast === undefined && cell.value.kind !== 'array') continue
    const coord = coordFromKey(key)
    if (coord === undefined || !couldReach(coord, query)) continue
    const grid = source.arrayAt(key, cell)
    if (grid === undefined) continue
    const rows = grid.length
    const cols = grid[0]?.length ?? 0
    if (rows < 1 || cols < 1) continue
    if (!overlaps(coord, rows, cols, query)) continue
    if (anchors === undefined) anchors = []
    anchors.push({ coord, rows, cols, grid })
  }

  source.settle?.()
  return { anchors: anchors ?? [], watch }
}

/**
 * `coord` 上的投影值；没有锚点盖住它 → `undefined`。
 *
 * 调用方必须先确认 `coord` **没有自有条目** —— 有条目的格子读自己的值（数组走
 * `anchorScalar`），轮不到投影。碰撞检测保证两片数组不会重叠，所以这里命中第一
 * 个就可以返回。
 */
export function projectedValueAt(
  scan: SpillAnchorScan,
  coord: CellCoord,
): Value | undefined {
  for (const anchor of scan.anchors) {
    const dr = coord.row - anchor.coord.row
    const dc = coord.col - anchor.coord.col
    if (dr < 0 || dc < 0 || dr >= anchor.rows || dc >= anchor.cols) continue
    return anchor.grid[dr]?.[dc] ?? BLANK
  }
  return undefined
}

/** 一格锚点都没有的空扫描。一次运行内的账本（`spill-projection-run.ts`）也用它。 */
export const NO_SPILL_ANCHORS = EMPTY_SCAN

/**
 * 扫描里所有**没有自有条目**的投影格坐标，行主序。
 *
 * 稀疏聚合（`SUM(A:A)` 那条路）只遍历 `cells` 里有条目的格子，所以投影格对它是
 * 隐形的。这个迭代器把它们补回去 —— 少了它 `SUM(A:A)` 会从 6 掉成 1（锚点被
 * `anchorScalar` 收成标量之后，A2/A3 没人报数）。
 *
 * `clip` 限定在调用方真正问的那个矩形里：`A:A` 的锚点可能铺出列外。
 */
export function* projectedCoordsIn(
  scan: SpillAnchorScan,
  clip: CellRange,
  cells: ReadonlyMap<CellKey, Cell>,
): Generator<{ readonly coord: CellCoord; readonly value: Value }> {
  for (const anchor of scan.anchors) {
    const rowStart = Math.max(clip.rowStart, anchor.coord.row)
    const rowEnd = Math.min(clip.rowEnd, anchor.coord.row + anchor.rows - 1)
    const colStart = Math.max(clip.colStart, anchor.coord.col)
    const colEnd = Math.min(clip.colEnd, anchor.coord.col + anchor.cols - 1)
    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let col = colStart; col <= colEnd; col += 1) {
        if (cells.has(`${row}:${col}`)) continue
        const value = anchor.grid[row - anchor.coord.row]?.[col - anchor.coord.col]
        yield { coord: { row, col }, value: value ?? BLANK }
      }
    }
  }
}
