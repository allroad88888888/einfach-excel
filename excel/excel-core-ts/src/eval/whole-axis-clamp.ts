/**
 * 一件事：**把整轴引用夹到已用区域，好让它能被物化**。
 *
 * ── 为什么需要它 ──
 *
 * `A:A` 经 `parseRange` 展开成 1048576 行的矩形，`F:G` 是它的两倍。三条物化路径
 * （`cell-read.ts` 的递归口、`trampoline-ctx.ts` 的蹦床口、`foreign-sheet.ts` 的
 * 跨表口）都有同一道 `range-gate.ts` 的闸门，越界一律 `#NUM!`。
 *
 * 不夹取的话本引擎会分成两个世界：约 17 个函数被 `evaluate.ts` 截走送进
 * `sparse-*.ts`，它们逐格遍历活单元格、整轴照常算；**其余全部**函数吃闸门。
 * 同一个引用，`=MATCH(3,F:F,0)` 与 `=MATCH(3,F1:F5,0)` 两个答案。
 *
 * ── 夹取为什么保语义 ──
 *
 * Excel 里整轴引用**起点固定在网格边**（`A:A` 从第 1 行起、`1:1` 从 A 列起），
 * 已用区域以外的格子全是空。所以只砍**尾巴**、绝不动头：
 *
 *  - 位置类语义（`MATCH` / `XMATCH` 的 1-based 位置、`INDEX` 的偏移）不受影响 ——
 *    它们从矩形起点数，起点没动。
 *  - 取值类语义（`SUMPRODUCT` / `LARGE` / `CORREL` / `TEXTJOIN`…）不受影响 ——
 *    砍掉的全是空格，它们本来就跳过空格。
 *  - 形状类语义（`ROWS` / `COLUMNS` / `COUNTBLANK` 的矩形基数）**不走物化**：
 *    `ROWS(A:A)` 从 `RuntimeRef` 的几何直接算，`COUNTBLANK` 是稀疏孪生。夹取
 *    在物化口，够不着它们。
 *
 * 尾巴取**整张表**的已用上限，不是这几列自己的 —— `SUMPRODUCT(F:F,G:G)` 要求
 * 两个实参同形，按列各夹会让 F、G 因为各自最后一个非空格不同行而错位报
 * `#VALUE!`。整张表一个口径 ⇒ 同一张表上所有整列夹出来的行数必然相等。
 *
 * ── 为什么还要多留 `SPILL_PROJECTION_LOOKBACK` ──
 *
 * 投影格在 `cells` 里**没有条目**（`A1 = =SEQUENCE(3)` 只留 A1 一条），按活单元格
 * 数出来的上限会把溢出的尾巴切掉。锚点能投多远有产品级上限
 * `SPILL_PROJECTION_LOOKBACK`，把它整个加回去就再也切不到 —— 多出来的是空格，
 * 按上面第二条不影响任何答案。
 *
 * ── 边界 ──
 *
 * 夹完仍越界（夹出来的矩形超过一整列，比如 `F:G` 在有 60 万行的表上）→ 照旧
 * `#NUM!`，闸门没被拆掉。未触及哨兵的有界大区域（`F1:F200000`）不夹 —— 那是
 * 用户明写的矩形，不是「整轴」这个约定；它现在照样物化得动，因为闸门抬到了
 * 一整列（见 `range-gate.ts`）。
 *
 * 早退用的是 `MATERIALIZED_RANGE_CELL_CAP`（10 万）而不是闸门那个数：低于它的
 * 整轴矩形（`1:1` 是 16384 格）物化本来就便宜，不值得为它扫一遍 `cells`。
 */
import type { Cell, CellKey, CellRange } from '../types'
import { EXCEL_MAX_COL, EXCEL_MAX_ROW } from '../refs'
import { cellCoordFromKey } from './cell-address'
import { SPILL_PROJECTION_LOOKBACK } from './spill-projection'
import { MATERIALIZED_RANGE_CELL_CAP, rangeCellCount } from './runtime-ref'

/**
 * 整轴引用 → 夹到已用区域的矩形。非整轴、或整轴但本来就装得下的，原样返回
 * （同一个对象，调用方可以按引用比较）。
 */
export function clampWholeAxisRange(
  range: CellRange,
  cells: ReadonlyMap<CellKey, Cell>,
): CellRange {
  const rowsUnbounded = range.rowStart === 0 && range.rowEnd === EXCEL_MAX_ROW
  const colsUnbounded = range.colStart === 0 && range.colEnd === EXCEL_MAX_COL
  if (!rowsUnbounded && !colsUnbounded) return range
  if (rangeCellCount(range) <= MATERIALIZED_RANGE_CELL_CAP) return range

  const used = usedBounds(cells, rowsUnbounded, colsUnbounded)
  const rowEnd = rowsUnbounded ? clampEnd(used.row, range.rowStart, EXCEL_MAX_ROW) : range.rowEnd
  const colEnd = colsUnbounded ? clampEnd(used.col, range.colStart, EXCEL_MAX_COL) : range.colEnd
  if (rowEnd === range.rowEnd && colEnd === range.colEnd) return range
  return { rowStart: range.rowStart, rowEnd, colStart: range.colStart, colEnd }
}

/** 已用上限 + 溢出回看余量，夹在 `[start, sentinel]` 里。 */
function clampEnd(usedMax: number, start: number, sentinel: number): number {
  const end = usedMax + SPILL_PROJECTION_LOOKBACK
  if (end < start) return start
  return end > sentinel ? sentinel : end
}

/**
 * 整张表活单元格的最大行 / 最大列。空表两项都是 `-1`，`clampEnd` 会把矩形收成
 * 起点那一格 —— `=MATCH(3,F:F,0)` 在空表上照样 `#N/A`。
 *
 * 不缓存是刻意的：`cells` 是**就地可变**的活 Map（见 `workbook.ts` 头注），按
 * Map 身份或 `size` 记住的上限会在「加一格 + 删一格」后给出偏小的答案，而偏小
 * 的上限会静默漏掉数据。代价与稀疏路径 `sparseValuesForRef` 的整表扫描同阶，
 * 而且只有整轴实参真的要被物化时才付。
 */
function usedBounds(
  cells: ReadonlyMap<CellKey, Cell>,
  needRow: boolean,
  needCol: boolean,
): { readonly row: number; readonly col: number } {
  let row = -1
  let col = -1
  for (const key of cells.keys()) {
    const coord = cellCoordFromKey(key)
    if (!coord) continue
    if (needRow && coord.row > row) row = coord.row
    if (needCol && coord.col > col) col = coord.col
  }
  return { row, col }
}
