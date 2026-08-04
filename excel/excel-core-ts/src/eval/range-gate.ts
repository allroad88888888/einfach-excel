/**
 * 一件事：**区域物化闸门** —— 多大的矩形拒绝物化，以及这个拒绝怎么传出去而
 * 不被下游当成数据。
 *
 * ── 闸门为什么存在 ──
 *
 * `A:A` 经 `parseRange` 展开成 1,048,576 行的矩形，`A:XFD` 是 16,777,216 格。
 * 把它们摊成 `Value[][]` 会挂死 worker，所以三条物化口（`cell-read.ts` 的递归
 * 口、`trampoline-ctx.ts` 的蹦床口、`foreign-sheet.ts` 的跨表口）都要一道上限。
 * 这一点没有争议。
 *
 * ── 上限为什么是「一整列」而不是 10 万 ──
 *
 * 原来的上限是 `MATERIALIZED_RANGE_CELL_CAP = 100_000`，出处写在
 * `cell-read.ts` 的注释里：「Use the same 100k cap as expandRange
 * (refs/ranges.ts EXPAND_MAX_CELLS). Picked to match Go-To-Special's
 * convention across the codebase.」—— 顺着往上查，`EXPAND_MAX_CELLS` 的注释
 * 又写着「Matches the PLAN.md / Go-To convention (`spreadsheet-ui-core` uses
 * 100k for selection preview & find/replace)」，而那个 10 万就是
 * `spreadsheet-ui-core/src/go-to/types.ts` 的 `GO_TO_SCAN_MAX_CELLS`。
 *
 * 也就是说：**求值器的物化上限是从一条 UI 的「定位条件」扫描约定抄来的**，
 * 从来没有按求值器自己的内存 / 时间预算量过。实测（jsdom + node，纯分配，
 * 见 commit 说明）：10 万格 11ms / 6MB、1,048,576 格 119ms / 63MB、
 * 400 万格 668ms / 244MB。10 万这个数比「会挂死 worker」低了整整一个数量级。
 *
 * 新上限取 `ARRAY_CELL_CAP`（= 1,048,576 = Excel 的一整列），于是能说出一条
 * 不变式：**一个矩形物化得动，当且仅当它作为数组结果落得了地**。落不了地的
 * （`arrayResult` 会给 `#VALUE!`）本来就没有下游，物化它纯属白干。
 *
 * 与之配对的另一个数 —— `runtime-ref.ts` 的 `MATERIALIZED_RANGE_CELL_CAP` ——
 * 留在 10 万不动。那是**另一件事**：稀疏孪生（SUM / COUNTIF / …）在多大的
 * 矩形上改走逐格遍历的**性能偏好**，不是「拒不拒绝」的安全闸门。两件事此前
 * 共用一个常量，是这道闸门最容易被误读的地方。
 *
 * ── 拒绝为什么必须带外带标记 ──
 *
 * 老写法直接 `return [[ERR('#NUM!', …)]]`，也就是把一次**结构性失败**编码成了
 * 一片 1×1 的**数据**。下游没有任何办法把它和「一个真的装着 `#NUM!` 的单格
 * 区域」分开，于是每个函数各自误读一遍：
 *
 *  - `MATCH` 当「一格没命中」→ `#N/A`（用户看到「没找到」，其实是撞了闸门）
 *  - `XLOOKUP` 同上 → `#N/A`
 *  - `VLOOKUP` 当「一列」→ `#REF!`
 *  - `SORT` / `UNIQUE` / `TRANSPOSE` → 溢出一片 1×1 的 `#NUM!`
 *  - `SUMPRODUCT` / `LARGE` / `CORREL` 才是把 `#NUM!` 冒上去的那一档
 *
 * 同一个原因，五种症状。`refuseMaterialization()` 把拒绝值登记进一个
 * `WeakSet`，`rangeRowsToValue()` 在**表达式**层就把它折回标量错误 ——
 * 于是它以 `args[i].kind === 'error'` 的形态到达函数，所有函数既有的
 * `propagateError` 一视同仁地把它冒上去。
 *
 * 注意这**不是**「让函数传播数组内部的错误」。`=MATCH(3,{1,#N/A,3},0)` 仍然
 * 答 3 —— 那是数据，Rust 侧的 `values_equal` 也是这么办的，改它会凭空造出
 * 一条新的跨引擎分歧。
 */
import type { Value } from '../types'
import { ERR } from './error-value'
import { ARRAY_CELL_CAP, arrayResult } from './array-shape'

/**
 * 物化矩形的格数上限（含）。超过 → 拒绝。
 *
 * 取值与 `ARRAY_CELL_CAP` 同源：物化的产物最终都要过 `arrayResult`，比它还
 * 大的矩形物化出来也只会换回 `#VALUE!`。
 */
export const MATERIALIZE_REFUSE_CELL_CAP = ARRAY_CELL_CAP

/**
 * 拒绝值的登记册。用 `WeakSet` 而不是给数组挂属性 / 按内容识别：
 * 内容识别会把「一个真的装着 `#NUM!` 的 1×1 区域」也认成拒绝，身份识别不会。
 */
const REFUSALS = new WeakSet<object>()

/** 超限 → 一片带标记的 1×1 拒绝值。调用方原样 `return` 即可。 */
export function refuseMaterialization(rowCount: number, colCount: number): Value[][] {
  const total = rowCount * colCount
  const rows: Value[][] = [
    [
      ERR(
        '#NUM!',
        `range too large to materialize (${rowCount}x${colCount} = ${total} cells; ` +
          `cap ${MATERIALIZE_REFUSE_CELL_CAP})`,
      ),
    ],
  ]
  REFUSALS.add(rows)
  return rows
}

/** 这个矩形是不是闸门吐出来的拒绝值？是 → 交回里面那个标量错误。 */
export function materializationRefusal(rows: Value[][]): Value | undefined {
  return REFUSALS.has(rows) ? rows[0][0] : undefined
}

/**
 * `ctx.rangeLookup()` 的产物 → 表达式的值。三条出口：闸门拒绝 → 标量错误
 * （**不是**一片装着错误的数组）、空矩形 → `#REF!`、其余 → 数组结果。
 *
 * 每个 `ctx.rangeLookup` 的调用点都必须走这里，否则那一条就是下一个把拒绝
 * 当数据读的地方。
 */
export function rangeRowsToValue(rows: Value[][], label = 'range result'): Value {
  const refused = materializationRefusal(rows)
  if (refused) return refused
  if (rows.length === 0 || rows[0].length === 0) return ERR('#REF!')
  return arrayResult(rows, label)
}
