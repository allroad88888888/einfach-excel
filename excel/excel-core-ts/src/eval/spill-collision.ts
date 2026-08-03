/**
 * 一件事：**一个数组值能不能在它的锚点上铺开**。
 *
 * 输入是「锚点坐标 + 数组形状 + 这张表的活单元格」，输出四选一：越界 / 被占 /
 * 通过 / 还差几个候选没算出来。唯一调用方是 `evaluate.ts` 的
 * `validateSpillAnchorValue`，它把判定翻成 `#SPILL!` 或原值。
 *
 * ── 为什么不能只看「矩形里有没有活单元格」 ──
 *
 * TS 侧的投影格是**虚**的：`C1 = =SEQUENCE(3)` 只在 C1 留一条 `cells` 条目，C2/C3
 * 在表里根本没有条目，读它们时才由锚点的数组投影出来。所以「遍历 `cells` 找落在
 * 矩形里的条目」这条老检测对「阻塞物是另一个数组的投影格」这一整类碰撞**一条都
 * 报不出来**：
 *
 *     C1 = =SEQUENCE(3)     占 C1:C3
 *     A2 = ={1,2,3,4}       想占 A2:D2，行主序第一个撞上 C2
 *
 * Rust 引擎把 A2 判成 `#SPILL!`；TS 照常溢出，投影层还会把 C2 盖掉。两个引擎产出
 * 的是**不同的值**，不是不同的提示。所以除了「矩形里有没有条目」，这里还要问
 * 「有没有别的锚点的矩形压过来」。
 *
 * ── 声明顺序：为什么用 `cells` 的迭代顺序 ──
 *
 * 两片数组重叠时必须有一个输、一个赢，否则两个都会判自己 `#SPILL!`。Excel 与
 * Rust 的规则是**先占住的赢**（`register_spill` 谁先登记谁拿走矩形，后来的直接
 * `Err`）—— 这是**写入顺序**，不是地址顺序：先写 A2 再写 C1 时输的是 C1。
 *
 * JS `Map` 的迭代顺序就是插入顺序，而插入顺序正是这张表**每个地址第一次被写入**
 * 的顺序（`Map.set` 对已存在的键保位不挪窝，`delete` + 重写则挪到队尾）。这与
 * Rust 的登记顺序逐条对上：改写赢家不翻盘（保位）、清掉赢家再写回则轮到它输
 * （挪到队尾）。所以本模块只把**排在自己前面**的锚点当作有效声明，排在后面的
 * 一概不看。
 *
 * 已知的边角偏差：带格式的格子被 `clearCell('value')` 清空时 `cells` 条目仍在原
 * 位（只是值变空），之后在那儿重写公式会沿用旧位次，而 Rust 会给一个新的登记
 * 次序。没有为它加索引 —— 那要一张与 `cells` 平行的顺序表，正是本仓禁止的旁路表。
 *
 * 这条顺序规则顺带保证了**探测不会绕回来**：锚点 K 只探测排在 K 前面的候选，
 * 候选 J 又只探测排在 J 前面的，严格递减 → 不循环、不需要防环。
 *
 * ── 代价 ──
 *
 * 整段只在「某个公式算出了数组」时才跑（`value.kind !== 'array'` 在调用方就返回
 * 了），扫一遍 `cells` 是**老代码本来就在付**的那一遍。新增的只有「候选锚点要
 * 求值一次」，而候选被四道闸门砍过：排在自己前面、落在矩形左上方向、按引擎的
 * 数组上限**够得着**矩形、且是公式格（`setCellValue` 塞进来的数组锚点形状现成，
 * 一次求值都不用）。求值本身走调用方的 trampoline 缓存，一轮里同一个候选只算
 * 一次。
 */

import { EXCEL_MAX_COL, EXCEL_MAX_ROW } from '../refs'
import type { Cell, CellCoord, CellKey, CellRange, Value } from '../types'

import { ARRAY_CELL_CAP } from './array-shape'

/** 「矩形被别的数组压住了」这一支的诊断文案。 */
const ARRAY_OVERLAP = 'spill range overlaps another array'

export type SpillCollision =
  /** 矩形跑出表边 —— 没有哪一格该被指责。 */
  | { readonly kind: 'outOfBounds' }
  /** 被占。`range` / `watch` 仍然返回，调用方要拿它们登记运行期依赖。 */
  | {
      readonly kind: 'blocked'
      readonly range: CellRange
      readonly reason: string
      readonly watch?: CellRange
    }
  /** 通过，可以铺开。 */
  | { readonly kind: 'clear'; readonly range: CellRange; readonly watch?: CellRange }
  /** 还不能下结论：这些候选锚点得先算出来。调用方算完再问一次。 */
  | { readonly kind: 'pending'; readonly keys: readonly CellKey[] }

/**
 * 候选锚点的取值口。实现方是调用方的 trampoline 缓存 —— 本模块不持有任何状态，
 * 也不缓存任何东西。
 */
export interface AnchorProbe {
  /** 候选这一轮已算出的值；还没算 → `undefined`。 */
  evaluated(key: CellKey): Value | undefined
  /** 候选正在本轮求值栈上 —— 它在读我们，不能反过来向我们索赔。 */
  inFlight(key: CellKey): boolean
}

/** 数组值的行列数；空数组（类型上不合法）当作没有形状。 */
function shapeOf(value: Value): { rows: number; cols: number } | undefined {
  if (value.kind !== 'array') return undefined
  const rows = value.value.length
  const cols = value.value[0]?.length ?? 0
  return rows > 0 && cols > 0 ? { rows, cols } : undefined
}

function containsCoord(range: CellRange, coord: CellCoord): boolean {
  return (
    coord.row >= range.rowStart &&
    coord.row <= range.rowEnd &&
    coord.col >= range.colStart &&
    coord.col <= range.colEnd
  )
}

function coordFromKey(key: CellKey): CellCoord | undefined {
  const sep = key.indexOf(':')
  if (sep < 0) return undefined
  const row = Number(key.slice(0, sep))
  const col = Number(key.slice(sep + 1))
  if (!Number.isInteger(row) || !Number.isInteger(col)) return undefined
  return { row, col }
}

/** 这一格挡不挡数组铺开。空值 + 无输入 + 无公式 = 不挡（可能只剩格式）。 */
export function cellBlocksSpill(cell: Cell): boolean {
  return cell.ast !== undefined || cell.input.length > 0 || cell.value.kind !== 'blank'
}

/**
 * `coord` 上的锚点**有没有可能**把矩形压到。纯几何，不求值。
 *
 * 数组只向右下铺，所以起点必须在矩形的左上方向；再用引擎的数组上限
 * （`ARRAY_CELL_CAP`）砍一刀：要够到矩形的左上角，最小得有
 * `(Δrow+1) × (Δcol+1)` 格，超过上限就永远够不着。这一刀是**保守**的 ——
 * 放宽只会多探测几个候选，不会漏判。
 */
function canReach(coord: CellCoord, range: CellRange): boolean {
  if (coord.row > range.rowEnd || coord.col > range.colEnd) return false
  const needRows = Math.max(1, range.rowStart - coord.row + 1)
  const needCols = Math.max(1, range.colStart - coord.col + 1)
  return needRows * needCols <= ARRAY_CELL_CAP
}

/** `coord` 上一片 `rows × cols` 的数组与 `range` 相交吗。 */
function overlaps(
  coord: CellCoord,
  shape: { rows: number; cols: number },
  range: CellRange,
): boolean {
  return (
    coord.row <= range.rowEnd &&
    coord.col <= range.colEnd &&
    coord.row + shape.rows - 1 >= range.rowStart &&
    coord.col + shape.cols - 1 >= range.colStart
  )
}

/**
 * 「看住这些格子」的外接矩形。
 *
 * 溢出矩形本身会被调用方登记成运行期依赖（写进矩形 → 锚点重算，ADR 0006 的塌缩
 * 与复活靠它）。但压过来的那片数组，它的**锚点在矩形外面** —— 清掉锚点时被挡的
 * 那一片必须复活，所以还要看住这些候选。
 *
 * 收成一个外接矩形而不是逐格登记：`DepGraph` 的区域索引按列分桶，一条矩形是
 * O(列数) 的插入，逐格登记则是候选个数条记录。代价是矩形会比实际候选宽 ——
 * 多出来的只会造成**多余的重算**，不会造成漏算，与该模块对静态依赖过近似的既有
 * 立场一致（见 `deps.ts` 文件头）。
 */
class BoundingBox {
  private rowStart = 0

  private rowEnd = 0

  private colStart = 0

  private colEnd = 0

  private empty = true

  add(coord: CellCoord): void {
    if (this.empty) {
      this.empty = false
      this.rowStart = coord.row
      this.rowEnd = coord.row
      this.colStart = coord.col
      this.colEnd = coord.col
      return
    }
    if (coord.row < this.rowStart) this.rowStart = coord.row
    if (coord.row > this.rowEnd) this.rowEnd = coord.row
    if (coord.col < this.colStart) this.colStart = coord.col
    if (coord.col > this.colEnd) this.colEnd = coord.col
  }

  range(): CellRange | undefined {
    if (this.empty) return undefined
    return {
      rowStart: this.rowStart,
      rowEnd: this.rowEnd,
      colStart: this.colStart,
      colEnd: this.colEnd,
    }
  }
}

/**
 * 判定 `anchor` 处一片 `shape` 的数组能不能铺开。
 *
 * `key` 是锚点自己的 `CellKey`（用来在 `cells` 里认出「排在我前面」的分界）。
 */
export function checkSpillCollision(
  anchor: CellCoord,
  shape: { readonly rows: number; readonly cols: number },
  cells: ReadonlyMap<CellKey, Cell>,
  key: CellKey,
  probe: AnchorProbe,
): SpillCollision {
  const rowEnd = anchor.row + shape.rows - 1
  const colEnd = anchor.col + shape.cols - 1
  if (rowEnd > EXCEL_MAX_ROW || colEnd > EXCEL_MAX_COL) return { kind: 'outOfBounds' }
  const range: CellRange = { rowStart: anchor.row, rowEnd, colStart: anchor.col, colEnd }

  // 一遍扫完：矩形里的活条目当场判死，矩形外的更早锚点记进待探测。
  const candidates: CellKey[] = []
  const watched = new BoundingBox()
  let seenSelf = false
  for (const [candidateKey, candidate] of cells) {
    if (candidateKey === key) {
      seenSelf = true
      continue
    }
    const coord = coordFromKey(candidateKey)
    if (coord === undefined) continue
    if (containsCoord(range, coord)) {
      if (cellBlocksSpill(candidate)) {
        return { kind: 'blocked', range, reason: 'spill range is not blank' }
      }
      continue
    }
    if (seenSelf || !canReach(coord, range)) continue
    watched.add(coord)
    if (candidate.ast === undefined) {
      // 非公式锚点（`setCellValue` 直接塞进来的数组）：形状现成，零求值。
      const literal = shapeOf(candidate.value)
      if (literal && overlaps(coord, literal, range)) {
        return { kind: 'blocked', range, reason: ARRAY_OVERLAP, watch: watched.range() }
      }
      continue
    }
    candidates.push(candidateKey)
  }

  const missing: CellKey[] = []
  for (const candidateKey of candidates) {
    if (probe.evaluated(candidateKey) !== undefined) continue
    // 求值栈上的祖先：它正在读我们，让它反过来索赔就成了环。当作不占地方。
    if (probe.inFlight(candidateKey)) continue
    missing.push(candidateKey)
  }
  if (missing.length > 0) return { kind: 'pending', keys: missing }

  const watch = watched.range()
  for (const candidateKey of candidates) {
    const found = shapeOf(probe.evaluated(candidateKey) ?? { kind: 'blank' })
    if (found === undefined) continue
    const coord = coordFromKey(candidateKey)
    if (coord && overlaps(coord, found, range)) {
      return { kind: 'blocked', range, reason: ARRAY_OVERLAP, watch }
    }
  }
  return { kind: 'clear', range }
}
