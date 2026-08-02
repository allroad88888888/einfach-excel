/**
 * 稀疏无条件聚合：SUM / COUNT / COUNTA / COUNTBLANK / AVERAGE / MIN / MAX 在
 * 「区域不物化」前提下的流式实现。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 本文件族（`eval/sparse-*.ts`）的硬约定：这里每一个函数都是 `FUNCTIONS`
 * 注册表里**同名函数的第二实现**，改一边必须改另一边。
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `evaluate` 的 `case 'call'` 分支在派发到内建函数表**之前**先按函数名把
 * SUM / COUNT / COUNTA / COUNTBLANK / AVERAGE / MIN / MAX / COUNTIF / SUMIF /
 * AVERAGEIF / COUNTIFS / SUMIFS / AVERAGEIFS / MAXIFS / MINIFS / SUBTOTAL /
 * AGGREGATE 这 17 个名字**截走**（见 `eval/evaluate.ts` 里 `case 'SUM'` 起
 * 的那一串 case）。只要参数里有一个可稀疏迭代的区域（整列 / 整行 / 超过物化
 * 上限），真正跑的就是本文件族；`FUNCTIONS.SUM`、`FUNCTIONS.COUNT` …… 在真实
 * 公式路径上**根本不执行**，只有直接调 `FunctionImpl` 的单测才碰得到它们。
 *
 * 所以两份实现对同一份输入必须给出同一个答案，否则「稀疏快路」就从一个优化
 * 变成了可观测的行为差异。这条约定不是假想的，本轮已经为它付了两次账：
 *
 *  1. **COUNT 的错误处理**：修好了 `FUNCTIONS.COUNT`（区域里的错误格对 COUNT
 *     透明），端到端仍然错 —— 稀疏孪生没跟着改。全套单测绿灯，是 always-on
 *     的跨引擎烟测才把它抓出来。留痕见 `evaluateSparseNumericAggregate` 里
 *     `addScalar` 的注释。
 *  2. **COUNTIFS / SUMIFS 同款**：`evaluate` 一口气截走了**八个** *IF / *IFS
 *     名字，只改 `functions/stats.ts` 那一侧对真实公式路径毫无影响。
 *
 * 因此改动任何一个被截流的函数时，请同时打开两处：注册表侧
 * `eval/functions/`（`math.ts` / `stats.ts`），稀疏侧 `eval/sparse-*.ts`。
 *
 * ── 与 `evaluate.ts` 的循环导入是有意的 ──
 *
 * 本文件族 import `evaluate.ts` 的 `evaluateFunctionArg` / `runtimeRefFromExpr`
 * / `canSparseIterate` / `sparseValuesForRef` 等，而 `evaluate.ts` 又 import 回
 * 本文件族的入口 —— 这是一个真实的模块环，且**语义上确实存在**：稀疏聚合本来
 * 就是求值器的一部分，非区域参数要递归回 `evaluate`，逐格读要走同一套
 * trampoline / NeedsDep 机制。用回调注入把依赖图伪装成无环，只会让模块图和
 * 运行时调用图对不上。仓库的 `import/no-cycle` 是关的，函数级环在 ESM 下安全
 * （调用都发生在模块初始化之后）—— 代价是本文件族**禁止在顶层求值任何从
 * `./evaluate` 导入的绑定**，否则会撞 TDZ。
 */

import type { EvalContext, Expr, Value } from '../types'
import { toNumber } from './coerce'
import {
  ERR,
  canSparseIterate,
  evaluateFunctionArg,
  rangeCellCount,
  runtimeRefFromExpr,
  sparseValuesForRef,
} from './evaluate'

/**
 * Expand any `multiArea` args into their constituent sub-areas so the sparse
 * aggregators below can route each whole-column / whole-row sub-area through
 * the existing sparse-iteration path. Non-multiArea args pass through unchanged.
 * Without this, `SUM((A:A,C:C))` would fall through to the materializing path
 * and trip the per-range materialization cap.
 */
function expandSparseArgs(args: ReadonlyArray<Expr>): ReadonlyArray<Expr> {
  let hasMultiArea = false
  for (const arg of args) {
    if (arg.kind === 'multiArea') {
      hasMultiArea = true
      break
    }
  }
  if (!hasMultiArea) return args
  const expanded: Expr[] = []
  for (const arg of args) {
    if (arg.kind === 'multiArea') {
      for (const area of arg.areas) expanded.push(area)
    } else {
      expanded.push(arg)
    }
  }
  return expanded
}

export function evaluateSparseSum(
  rawArgs: ReadonlyArray<Expr>,
  ctx: EvalContext,
): Value | undefined {
  const args = expandSparseArgs(rawArgs)
  let usedSparseRef = false
  let total = 0

  const addRangeCell = (cell: Value): Value | undefined => {
    if (cell.kind === 'error') return cell
    if (cell.kind === 'number') total += cell.value
    if (cell.kind === 'array') return addArray(cell)
    return undefined
  }

  const addArray = (value: Value & { kind: 'array' }): Value | undefined => {
    for (const row of value.value) {
      for (const cell of row) {
        const error = addRangeCell(cell)
        if (error) return error
      }
    }
    return undefined
  }

  const addEvaluatedArg = (value: Value): Value | undefined => {
    if (value.kind === 'error') return value
    if (value.kind === 'array') return addArray(value)
    const n = toNumber(value)
    if (!n.ok) return n.error
    total += n.value
    return undefined
  }

  for (const arg of args) {
    const ref = runtimeRefFromExpr(arg, ctx)
    if (ref.ok && canSparseIterate(ref.ref)) {
      usedSparseRef = true
      const sparse = sparseValuesForRef(ref.ref, ctx)
      if (!sparse.ok) return sparse.error
      for (const { value } of sparse.values) {
        const error = addRangeCell(value)
        if (error) return error
      }
      continue
    }

    const error = addEvaluatedArg(evaluateFunctionArg(arg, ctx))
    if (error) return error
  }

  return usedSparseRef ? { kind: 'number', value: total } : undefined
}

export type SparseAggregateKind = 'count' | 'average' | 'min' | 'max'

export function evaluateSparseNumericAggregate(
  rawArgs: ReadonlyArray<Expr>,
  ctx: EvalContext,
  kind: SparseAggregateKind,
): Value | undefined {
  const args = expandSparseArgs(rawArgs)
  let usedSparseRef = false
  let total = 0
  let count = 0
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  const visitNumber = (value: number): void => {
    total += value
    count += 1
    if (value < min) min = value
    if (value > max) max = value
  }

  // COUNT is error-TRANSPARENT inside a reference or an array — an error cell
  // is simply not a number — while AVERAGE / MIN / MAX still propagate. Same
  // split as `forEachCountNumber` in `functions/math.ts`, which this streaming
  // twin must answer identically or the sparse fast path becomes observable.
  // A SCALAR arg still propagates for every kind (see `addScalar`).
  const addRangeCell = (cell: Value): Value | undefined => {
    if (cell.kind === 'error') return kind === 'count' ? undefined : cell
    if (cell.kind === 'number') visitNumber(cell.value)
    if (cell.kind === 'array') return addArray(cell)
    return undefined
  }

  const addArray = (value: Value & { kind: 'array' }): Value | undefined => {
    for (const row of value.value) {
      for (const cell of row) {
        const error = addRangeCell(cell)
        if (error) return error
      }
    }
    return undefined
  }

  const addScalar = (value: Value): Value | undefined => {
    // `count` skips errors here for the same reason `addRangeCell` does: an
    // error is not a number, and COUNT does not care whether it arrived
    // through a range or was written straight into the argument list. This
    // branch is the one the REAL formula path uses — `evaluate` intercepts
    // COUNT before `FUNCTIONS.COUNT` is ever reached (see the `case 'COUNT'`
    // call site in `eval/evaluate.ts`), so a unit test calling the FunctionImpl
    // directly cannot see it. The always-on cross-engine smoke caught it.
    if (value.kind === 'error') return kind === 'count' ? undefined : value
    if (value.kind === 'array') return addArray(value)
    if (kind === 'count') {
      if (value.kind === 'number') visitNumber(value.value)
      return undefined
    }
    const n = toNumber(value)
    if (!n.ok) return n.error
    visitNumber(n.value)
    return undefined
  }

  for (const arg of args) {
    const ref = runtimeRefFromExpr(arg, ctx)
    if (ref.ok && canSparseIterate(ref.ref)) {
      usedSparseRef = true
      const sparse = sparseValuesForRef(ref.ref, ctx)
      if (!sparse.ok) return sparse.error
      for (const { value } of sparse.values) {
        const error = addRangeCell(value)
        if (error) return error
      }
      continue
    }

    const error = addScalar(evaluateFunctionArg(arg, ctx))
    if (error) return error
  }

  if (!usedSparseRef) return undefined
  switch (kind) {
    case 'count':
      return { kind: 'number', value: count }
    case 'average':
      return count === 0 ? ERR('#DIV/0!') : { kind: 'number', value: total / count }
    case 'min':
      return { kind: 'number', value: count === 0 ? 0 : min }
    case 'max':
      return { kind: 'number', value: count === 0 ? 0 : max }
  }
}

export function evaluateSparseCountA(
  rawArgs: ReadonlyArray<Expr>,
  ctx: EvalContext,
): Value | undefined {
  const args = expandSparseArgs(rawArgs)
  let usedSparseRef = false
  let count = 0

  const addArray = (value: Value & { kind: 'array' }): void => {
    for (const row of value.value) {
      for (const cell of row) {
        if (cell.kind !== 'blank') count += 1
      }
    }
  }

  const addScalar = (value: Value): Value | undefined => {
    // An error is not blank, so COUNTA tallies it — direct argument or range
    // cell alike (the range walk above already says so with the same
    // `!== 'blank'` test). This is the sparse twin of `FUNCTIONS.COUNTA`
    // and it is what the real formula path reaches; keeping a propagation
    // here while the FunctionImpl skipped it is how the two halves drifted.
    if (value.kind === 'array') {
      addArray(value)
    } else if (value.kind !== 'blank') {
      count += 1
    }
    return undefined
  }

  for (const arg of args) {
    const ref = runtimeRefFromExpr(arg, ctx)
    if (ref.ok && canSparseIterate(ref.ref)) {
      usedSparseRef = true
      const sparse = sparseValuesForRef(ref.ref, ctx)
      if (!sparse.ok) return sparse.error
      for (const { value } of sparse.values) {
        if (value.kind !== 'blank') count += 1
      }
      continue
    }

    const error = addScalar(evaluateFunctionArg(arg, ctx))
    if (error) return error
  }

  return usedSparseRef ? { kind: 'number', value: count } : undefined
}

export function evaluateSparseCountBlank(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): Value | undefined {
  if (args.length !== 1) return undefined
  const ref = runtimeRefFromExpr(args[0], ctx)
  if (!ref.ok || !canSparseIterate(ref.ref)) return undefined

  const sparse = sparseValuesForRef(ref.ref, ctx)
  if (!sparse.ok) return sparse.error

  let count = rangeCellCount(ref.ref.range) - sparse.values.length
  for (const { value } of sparse.values) {
    if (value.kind === 'blank' || (value.kind === 'string' && value.value === '')) count += 1
  }
  return { kind: 'number', value: count }
}
