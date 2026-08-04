/**
 * 一件事：**物化路径上，把 SUMIF / AVERAGEIF 的值区实参按「左上角 + 条件区形状」
 * 重新读一遍**，再交给 `FUNCTIONS` 注册表里的实现。
 *
 * 为什么必须在求值器这一层做：`FUNCTIONS.SUMIF` 只拿得到 `Value[]`，值区被压成
 * 一个数组之后就再也不知道它落在网格的哪里 —— 而 Excel 的规则要求越过值区自身
 * 的边界继续往下读（`SUMIF(A1:A3,">1",B1)` 要读到 B3）。只有还握着 `Expr` 的
 * 求值器能把这片格子重新解析出来。
 *
 * 事故留痕：修之前这条路用 `n = min(len(range), len(sum_range))` 截断，于是
 * `SUMIF(A1:A3,">1",B1)` 给 0、`SUMIF(A1:A3,">1",B1:B2)` 给 200（Excel 都是
 * 500）；而同一个函数的稀疏孪生 `evaluateSparseSumIf` 用 `relativeCoord` 走的
 * 正是对的规则 —— 同一组输入，两条路两个答案，且没有任何测试把它们对起来。
 * 现在两条路共用 `criteria-value-rect.ts` 的同一条几何规则，配对断言在
 * `test/criteria-value-range.test.ts`。
 */
import type { CellCoord, EvalContext, Expr, Value } from '../types'
import type { RuntimeRefResult } from './runtime-ref-resolve'
import { ERR } from './error-value'
import { criteriaValueRect, sameRectShape, usesCriteriaValueRect } from './criteria-value-rect'

/** 需要替换的实参下标 —— SUMIF / AVERAGEIF 的值区固定是第三个。 */
const VALUE_ARG_INDEX = 2

/**
 * 求值器按回调传进来的两件事。**不回头 import `evaluate.ts`** —— 本文件被
 * 求值器直接依赖，反向 import 会成环，而循环依赖在本仓是硬门禁
 * （`rollup.config.mjs` 的 `INTENTIONAL_CYCLE` 白名单不为新代码开口）。
 * 形状照抄同目录的 `RefResolveDeps` / `RefInfoDeps`。
 */
export interface CriteriaValueDeps {
  /** 表达式 → 运行期引用矩形（`evaluate.ts` 的 `runtimeRefFromExpr`）。 */
  readonly resolveRef: (expr: Expr, ctx: EvalContext) => RuntimeRefResult
  /** 单格读，折叠成标量（`evaluate.ts` 的 `valueAtRuntimeCoord`）。 */
  readonly valueAt: (
    sheetName: string | undefined,
    coord: CellCoord,
    ctx: EvalContext,
  ) => Value
}

export interface AlignedCriteriaValueArg {
  readonly index: number
  readonly value: Value
}

/**
 * 值区实参要不要重读？要就返回替换值，不要就返回 `undefined`（调用方照常求值）。
 *
 * 返回 `undefined` 的几种情形，都是刻意保持原行为：
 *  - 不是 SUMIF / AVERAGEIF，或没写第三个实参；
 *  - 条件区或值区不是引用（数组字面量、函数结果……）—— Excel 这条规则讲的是
 *    引用的几何，非引用没有「左上角」可言；
 *  - 两边形状本来就一样 —— 重读会得到同一片格子，白花开销。
 */
export function alignCriteriaValueArg(
  upperName: string,
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: CriteriaValueDeps,
): AlignedCriteriaValueArg | undefined {
  if (!usesCriteriaValueRect(upperName)) return undefined
  if (args.length !== VALUE_ARG_INDEX + 1) return undefined

  const criteriaRef = deps.resolveRef(args[0], ctx)
  const valueRef = deps.resolveRef(args[VALUE_ARG_INDEX], ctx)
  if (!criteriaRef.ok || !valueRef.ok) return undefined
  // 已经物化的引用（LET / LAMBDA 绑定携带的快照）没有可回读的网格坐标。
  if (criteriaRef.ref.materialized || valueRef.ref.materialized) return undefined
  if (sameRectShape(criteriaRef.ref.range, valueRef.ref.range)) return undefined

  const rect = criteriaValueRect(criteriaRef.ref.range, valueRef.ref.range)
  if (!rect) return { index: VALUE_ARG_INDEX, value: ERR('#REF!') }

  const sheetName = valueRef.ref.sheetName
  const rows: Value[][] = []
  for (let row = rect.rowStart; row <= rect.rowEnd; row += 1) {
    const cells: Value[] = []
    for (let col = rect.colStart; col <= rect.colEnd; col += 1) {
      // 与稀疏孪生同一个读函数：错误格原样带出来，由 SUMIF / AVERAGEIF 决定
      // 传播（值区）还是参与比较（条件区）。
      cells.push(deps.valueAt(sheetName, { row, col }, ctx))
    }
    rows.push(cells)
  }
  return { index: VALUE_ARG_INDEX, value: { kind: 'array', value: rows } }
}
