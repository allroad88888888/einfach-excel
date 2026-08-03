/**
 * Formula evaluator.
 *
 * Walks the parsed `Expr` tree and produces a public `Value`. Evaluator-owned
 * functions that need raw expressions are intercepted before ordinary built-in
 * dispatch, including lazy logical selectors, LET/LAMBDA, dynamic-array LAMBDA
 * callbacks, reference-aware metadata functions, INDIRECT/OFFSET, and
 * multi-area reference materialization for function arguments.
 *
 * Critical invariant: this function never touches the atom store. It only reads
 * from `ctx.cells` (or `ctx.crossSheetCells(...)` for cross-sheet), which were
 * snapshotted by the caller with a single `get(sheetAtom)`. That's how the
 * broad-dep, fine-lookup model stays honest: each formula derive registers one
 * dependency on its own sheet atom, plus one per referenced cross-sheet.
 */

import type {
  CallExpr,
  Cell,
  CellCoord,
  CellKey,
  EvalContext,
  Expr,
  LambdaBinding,
  Value,
} from '../types'
import { getBuiltinFunction } from './functions'
import { excelEquals } from './functions/logical'
import { resolveXLookupValue, type XLookupCoreResult } from './functions/lookup'
import { propagateError, toBoolean, toNumber } from './coerce'
// 下面这一批是从本文件切出去的模块。它们只接收参数（求值器按回调传进去）、
// 不回头 import `evaluate.ts`，所以一条新的环都没引入 —— 形状照抄
// `spill-collision.ts` / `spill-projection.ts` 那两个纯函数模块。对外导出面不变：
// 本文件末尾把别处仍按 `from './evaluate'` 取用的名字原样再导出一遍。
import { BLANK } from '../types'
import { ERR } from './error-value'
import { ARRAY_CELL_CAP, arrayResult, arrayShapeError, scalarCellError } from './array-shape'
import { makeMatrix, valueToGrid, type Grid } from './grid'
import {
  canSparseIterate,
  rangeCellCount,
  sameRuntimeRefRange,
  validateRuntimeRefSheet,
  type RuntimeRef,
} from './runtime-ref'
import { applyBinary } from './binary-ops'
import { parseRefToCoord, parseRefToKey } from './cell-address'
import { cycleGuardKey } from './cycle-guard'
import { evaluateCellTrampolined as evaluateCellWithWorkStack } from './trampoline'
import {
  rangeLookupGeneric as rangeLookupIn,
  refLookupGeneric as refLookupIn,
} from './cell-read'
import { evaluateInForeignSheet as evaluateInForeignSheetWith } from './foreign-sheet'
import {
  evaluateRuntimeRef as evaluateRuntimeRefIn,
  rawValueAtRuntimeCoord as rawValueAtRuntimeCoordIn,
  sparseValuesForRef as sparseValuesForRefIn,
  valueAtRuntimeCoord as valueAtRuntimeCoordIn,
} from './runtime-ref-read'
import {
  applyLambda,
  applyLambdaForArrayCell,
  bindLambdaSelf,
  makeLambdaBinding,
  prepareLambdaContext,
  type LambdaArgument,
  type LambdaResolveResult,
} from './lambda-apply'
import { canonicalName } from './canonical-name'
import {
  evaluateArrayChoose,
  evaluateArrayIf,
  evaluateArrayIfError,
  evaluateArrayIfs,
  evaluateArraySwitch,
} from './array-selectors'
import {
  evaluateAreas,
  evaluateColumn,
  evaluateColumns,
  evaluateFormulaText,
  evaluateIsFormula,
  evaluateIsRef,
  evaluateRow,
  evaluateRows,
  evaluateSheet,
  evaluateSheets,
  type RefInfoDeps,
} from './reference-info'
import { evaluateCellInfo } from './cell-info'
import {
  chooseSelectedExpr as resolveChooseSelectedExpr,
  runtimeRefFromExpr as resolveRefFromExpr,
  runtimeRefFromIndexArgs as resolveIndexArgs,
  runtimeRefFromIndirectArgs as resolveIndirectArgs,
  runtimeRefFromOffsetArgs as resolveOffsetArgs,
  runtimeRefFromSpillRef as resolveSpillRefArgs,
  type IntegerArgResult,
  type RefResolveDeps,
  type RuntimeRefResult,
  type SelectedExprResult,
} from './runtime-ref-resolve'
// 稀疏聚合族：`evaluate` 在派发到内建函数表之前，把 17 个聚合函数名截走交给
// 这一族的流式实现，两份实现必须同判 —— 约定与两起真实事故的留痕见
// `sparse-aggregations.ts` 文件头。与它们的循环导入是有意的，同处有说明。
import {
  evaluateSparseCountA,
  evaluateSparseCountBlank,
  evaluateSparseNumericAggregate,
  evaluateSparseSum,
} from './sparse-aggregations'
import {
  evaluateSparseAverageIf,
  evaluateSparseCountIf,
  evaluateSparseSumIf,
} from './sparse-single-criterion'
import {
  evaluateSparseAverageIfs,
  evaluateSparseCountIfs,
  evaluateSparseMinMaxIfs,
  evaluateSparseSumIfs,
} from './sparse-multi-criterion'
import { evaluateSparseAggregate, evaluateSparseSubtotal } from './sparse-subtotal'
// 溢出投影：跨表锚点折叠成左上角标量的单点实现。几何住在 `spill-projection.ts`，
// 一次求值内的备忘录与运行期依赖收集住在 `spill-projection-run.ts`。
import { anchorScalar } from './spill-projection'

// ----------------------------------------------------------------------------
// 「表达式 → 运行期引用矩形」的绑定。
//
// 解析本身住在 `runtime-ref-resolve.ts`，它把求值器**参数化**了（直接 import 会
// 让两个文件成环）。这里绑一次回调，再用原来的名字包回来 —— 本文件里那三十来处
// 调用点、以及 `sparse-multi-criterion.ts` 的 `import { runtimeRefFromExpr }`，
// 一个字节都不用改。
// ----------------------------------------------------------------------------
const REF_RESOLVE_DEPS: RefResolveDeps = { evaluate, rawValueAt: rawValueAtRuntimeCoord }

/** 引用元数据函数族（`reference-info.ts`）向本文件索取的回调，同样是绑一次。 */
const REF_INFO_DEPS: RefInfoDeps = { evaluate, resolveRef: runtimeRefFromExpr, evaluateRuntimeRef }

export function runtimeRefFromExpr(expr: Expr, ctx?: EvalContext): RuntimeRefResult {
  return resolveRefFromExpr(expr, ctx, REF_RESOLVE_DEPS)
}

function runtimeRefFromIndirectArgs(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): RuntimeRefResult {
  return resolveIndirectArgs(args, ctx, REF_RESOLVE_DEPS)
}

function runtimeRefFromOffsetArgs(args: ReadonlyArray<Expr>, ctx: EvalContext): RuntimeRefResult {
  return resolveOffsetArgs(args, ctx, REF_RESOLVE_DEPS)
}

function runtimeRefFromIndexArgs(args: ReadonlyArray<Expr>, ctx: EvalContext): RuntimeRefResult {
  return resolveIndexArgs(args, ctx, REF_RESOLVE_DEPS)
}

function runtimeRefFromSpillRef(
  expr: Extract<Expr, { readonly kind: 'spillRef' }>,
  ctx: EvalContext,
): RuntimeRefResult {
  return resolveSpillRefArgs(expr, ctx, REF_RESOLVE_DEPS)
}

function chooseSelectedExpr(args: ReadonlyArray<Expr>, ctx: EvalContext): SelectedExprResult {
  return resolveChooseSelectedExpr(args, ctx, REF_RESOLVE_DEPS)
}

type SliceRangeResult =
  | { readonly ok: true; readonly start: number; readonly end: number }
  | { readonly ok: false; readonly error: Value }

export function evaluate(ast: Expr, ctx: EvalContext): Value {
  switch (ast.kind) {
    case 'number':
      return { kind: 'number', value: ast.value }
    case 'string':
      return { kind: 'string', value: ast.value }
    case 'boolean':
      return { kind: 'boolean', value: ast.value }
    case 'error':
      return { kind: 'error', code: ast.code }

    case 'ref':
      return ctx.refLookup(ast.a1)

    case 'range': {
      const rows = ctx.rangeLookup(ast.start, ast.end)
      // Empty range is invalid input — surface #REF!.
      if (rows.length === 0 || rows[0].length === 0) {
        return ERR('#REF!')
      }
      return arrayResult(rows, 'range result')
    }

    case 'dynamicRange': {
      const resolved = runtimeRefFromExpr(ast, ctx)
      if (!resolved.ok) return resolved.error ?? ERR('#VALUE!')
      return evaluateRuntimeRef(resolved.ref, ctx)
    }

    case 'spillRef':
      return evaluateSpillRef(ast, ctx)

    case 'crossSheet': {
      const sheetCells = ctx.crossSheetCells(ast.sheetName)
      if (!sheetCells) return ERR('#REF!')
      const value = evaluateInForeignSheet(ast.inner, ctx, sheetCells, ast.sheetName)
      // 跨表单格与本表同一条规则：锚点读成左上角标量（`Sheet2!A1+1` 是 2，不是
      // 一片广播）。整片仍然只有 `Sheet2!A1#` 拿得到 —— 那条走 `spillRef`，
      // 经 `rawValueAtRuntimeCoord` 绕开这里。
      return ast.inner.kind === 'ref' ? anchorScalar(value) : value
    }

    case 'multiArea':
      return ERR('#VALUE!', 'multi-area references are only supported by evaluator-aware functions')

    case 'name': {
      // LAMBDA scope wins over workbook-level names — a parameter name
      // shadowing a defined name is the whole point of LAMBDA parameters.
      // See ARCH §9 / types.ts `EvalContext.lambdaScope`.
      const name = canonicalName(ast.name)
      if (ctx.lambdaScope) {
        const scoped = ctx.lambdaScope.get(name)
        if (scoped !== undefined) return scoped
      }
      const scopedRef = ctx.lambdaRefScope?.get(name)
      if (scopedRef) return evaluateRuntimeRef(scopedRef, ctx)
      if (ctx.lambdaFunctionScope?.has(name)) {
        return ERR(
          '#CALC!',
          `LAMBDA '${ast.name}' must be invoked or passed to an evaluator-aware function`,
        )
      }
      const binding = ctx.resolveName(ast.name)
      if (!binding) return ERR('#NAME?')
      switch (binding.kind) {
        case 'value':
          return binding.value
        case 'range': {
          if (binding.sheetName !== undefined) {
            const sheetCells = ctx.crossSheetCells(binding.sheetName)
            if (!sheetCells) return ERR('#REF!')
            return evaluateInForeignSheet(
              { kind: 'range', start: binding.start, end: binding.end },
              ctx,
              sheetCells,
              binding.sheetName,
            )
          }
          const rows = ctx.rangeLookup(binding.start, binding.end)
          if (rows.length === 0 || rows[0].length === 0) return ERR('#REF!')
          return arrayResult(rows, 'range result')
        }
        case 'lambda':
          // A LAMBDA name referenced without a call site is a bare
          // function value. Excel surfaces `#CALC!` (the calc engine
          // cannot reduce a function value to a scalar).
          return ERR(
            '#CALC!',
            `LAMBDA '${ast.name}' must be invoked with arguments (e.g. =${ast.name}(...))`,
          )
      }
      // Exhaustiveness fallback.
      return ERR('#NAME?')
    }

    case 'unary': {
      const inner = evaluate(ast.operand, ctx)
      const propagated = propagateError([inner])
      if (propagated) return propagated
      const n = toNumber(inner)
      if (!n.ok) return n.error
      return { kind: 'number', value: ast.op === '-' ? -n.value : n.value }
    }

    case 'percent': {
      const inner = evaluate(ast.operand, ctx)
      const propagated = propagateError([inner])
      if (propagated) return propagated
      const n = toNumber(inner)
      if (!n.ok) return n.error
      return { kind: 'number', value: n.value / 100 }
    }

    case 'binary': {
      const left = evaluate(ast.left, ctx)
      const right = evaluate(ast.right, ctx)
      return applyBinary(ast.op, left, right)
    }

    case 'arrayLiteral': {
      const out: Value[][] = []
      for (const row of ast.rows) {
        const inner: Value[] = []
        for (const cell of row) {
          const value = evaluate(cell, ctx)
          const scalarError = scalarCellError(value)
          if (scalarError) return scalarError
          inner.push(value)
        }
        out.push(inner)
      }
      if (out.length === 0 || out[0].length === 0) return ERR('#VALUE!')
      return arrayResult(out, 'array literal')
    }

    case 'lambdaCall': {
      const resolved = resolveLambdaExpr(ast.callee, ctx)
      if (resolved.error) return resolved.error
      if (!resolved.lambda) {
        const callee = evaluate(ast.callee, ctx)
        if (callee.kind === 'error') return callee
        return ERR('#VALUE!', 'expected LAMBDA')
      }
      const argValues: LambdaArgument[] = ast.args.map((a) => evaluateLambdaArg(a, ctx))
      return applyLambda(resolved.lambda, argValues, ctx, evaluate)
    }

    case 'call': {
      // ---------------------------------------------------------------
      // Lazy short-circuit: logical selector/error-handler functions must
      // not pre-evaluate unreachable branches.
      //
      // Without this, a textbook recursive LAMBDA like
      //   FACT(n) = IF(n<=1, 1, n*FACT(n-1))
      // recurses into the unreachable else-branch on every call and
      // blows the JS stack. Special-casing these here matches the Rust
      // engine (see `excel/rust/excel-core/src/eval.rs` § `"IF"`) which
      // receives raw `&[Expr]` and lazily evaluates the chosen branch.
      // ---------------------------------------------------------------
      const upper = ast.name.toUpperCase()
      switch (upper) {
        case 'IF':
          return evaluateIf(ast.args, ctx)
        case 'IFERROR':
          return evaluateIfError(ast.args, ctx)
        case 'IFNA':
          return evaluateIfNa(ast.args, ctx)
        case 'IFS':
          return evaluateIfs(ast.args, ctx)
        case 'SWITCH':
          return evaluateSwitch(ast.args, ctx)
        case 'SUM': {
          const streamed = evaluateSparseSum(ast.args, ctx)
          if (streamed !== undefined) return streamed
          break
        }
        case 'COUNT': {
          const streamed = evaluateSparseNumericAggregate(ast.args, ctx, 'count')
          if (streamed !== undefined) return streamed
          break
        }
        case 'COUNTA': {
          const streamed = evaluateSparseCountA(ast.args, ctx)
          if (streamed !== undefined) return streamed
          break
        }
        case 'COUNTBLANK': {
          const streamed = evaluateSparseCountBlank(ast.args, ctx)
          if (streamed !== undefined) return streamed
          break
        }
        case 'AVERAGE': {
          const streamed = evaluateSparseNumericAggregate(ast.args, ctx, 'average')
          if (streamed !== undefined) return streamed
          break
        }
        case 'MIN': {
          const streamed = evaluateSparseNumericAggregate(ast.args, ctx, 'min')
          if (streamed !== undefined) return streamed
          break
        }
        case 'MAX': {
          const streamed = evaluateSparseNumericAggregate(ast.args, ctx, 'max')
          if (streamed !== undefined) return streamed
          break
        }
        case 'COUNTIF': {
          const streamed = evaluateSparseCountIf(ast.args, ctx)
          if (streamed !== undefined) return streamed
          break
        }
        case 'SUMIF': {
          const streamed = evaluateSparseSumIf(ast.args, ctx)
          if (streamed !== undefined) return streamed
          break
        }
        case 'AVERAGEIF': {
          const streamed = evaluateSparseAverageIf(ast.args, ctx)
          if (streamed !== undefined) return streamed
          break
        }
        case 'COUNTIFS': {
          const streamed = evaluateSparseCountIfs(ast.args, ctx)
          if (streamed !== undefined) return streamed
          break
        }
        case 'SUMIFS': {
          const streamed = evaluateSparseSumIfs(ast.args, ctx)
          if (streamed !== undefined) return streamed
          break
        }
        case 'AVERAGEIFS': {
          const streamed = evaluateSparseAverageIfs(ast.args, ctx)
          if (streamed !== undefined) return streamed
          break
        }
        case 'MAXIFS': {
          const streamed = evaluateSparseMinMaxIfs(ast.args, ctx, 'max')
          if (streamed !== undefined) return streamed
          break
        }
        case 'MINIFS': {
          const streamed = evaluateSparseMinMaxIfs(ast.args, ctx, 'min')
          if (streamed !== undefined) return streamed
          break
        }
        case 'SUBTOTAL': {
          const streamed = evaluateSparseSubtotal(ast.args, ctx)
          if (streamed !== undefined) return streamed
          break
        }
        case 'AGGREGATE': {
          const streamed = evaluateSparseAggregate(ast.args, ctx)
          if (streamed !== undefined) return streamed
          break
        }
      }

      switch (upper) {
        case 'LET':
          return evaluateLet(ast.args, ctx)
        case 'LAMBDA':
          return ERR('#CALC!', 'LAMBDA must be invoked or passed to a higher-order function')
        case 'ISOMITTED':
          return evaluateIsOmitted(ast.args, ctx)
        case 'MAP':
          return evaluateMap(ast.args, ctx)
        case 'REDUCE':
          return evaluateReduce(ast.args, ctx)
        case 'SCAN':
          return evaluateScan(ast.args, ctx)
        case 'BYROW':
          return evaluateByRow(ast.args, ctx)
        case 'BYCOL':
          return evaluateByCol(ast.args, ctx)
        case 'MAKEARRAY':
          return evaluateMakeArray(ast.args, ctx)
        case 'FILTER':
          return evaluateFilter(ast.args, ctx)
        case 'TOCOL': {
          const sparse = evaluateTocolSparse(ast.args, ctx)
          if (sparse !== undefined) return sparse
          break
        }
        case 'TAKE': {
          const sliced = evaluateTakeDrop(ast.args, ctx, 'take')
          if (sliced !== undefined) return sliced
          break
        }
        case 'DROP': {
          const sliced = evaluateTakeDrop(ast.args, ctx, 'drop')
          if (sliced !== undefined) return sliced
          break
        }
        case 'CHOOSE':
          return evaluateChoose(ast.args, ctx)
        case 'XLOOKUP':
          return evaluateXLookup(ast.args, ctx)
        case 'INDEX':
          return evaluateIndex(ast.args, ctx)
        case 'ISFORMULA':
          return evaluateIsFormula(ast.args, ctx, REF_INFO_DEPS)
        case 'ISREF':
          return evaluateIsRef(ast.args, ctx, REF_INFO_DEPS)
        case 'SHEET':
          return evaluateSheet(ast.args, ctx, REF_INFO_DEPS)
        case 'SHEETS':
          return evaluateSheets(ast.args, ctx, REF_INFO_DEPS)
        case 'AREAS':
          return evaluateAreas(ast.args, ctx, REF_INFO_DEPS)
        case 'FORMULATEXT':
          return evaluateFormulaText(ast.args, ctx, REF_INFO_DEPS)
        case 'CELL':
          return evaluateCellInfo(ast.args, ctx, REF_INFO_DEPS)
        case 'INDIRECT':
          return evaluateIndirect(ast.args, ctx)
        case 'OFFSET':
          return evaluateOffset(ast.args, ctx)
        case 'ROW':
          return evaluateRow(ast.args, ctx, REF_INFO_DEPS)
        case 'COLUMN':
          return evaluateColumn(ast.args, ctx, REF_INFO_DEPS)
        case 'ROWS':
          return evaluateRows(ast.args, ctx, REF_INFO_DEPS)
        case 'COLUMNS':
          return evaluateColumns(ast.args, ctx, REF_INFO_DEPS)
      }

      // Dispatch order: built-in registry → workbook LAMBDA name →
      // host custom formula → #NAME?. Built-ins shadow customs by
      // convention (custom formulas refuse registration with a builtin
      // name on the host side). LAMBDA names sit between built-ins and
      // customs so user-defined names can't override SUM but a custom
      // host callback can't override a LAMBDA definition either.
      const builtin = getBuiltinFunction(ast.name)
      if (builtin) {
        const argValues: Value[] = ast.args.map((a) => evaluateFunctionArg(a, ctx))
        return builtin(argValues, ctx)
      }

      const scopedLambda = ctx.lambdaFunctionScope?.get(canonicalName(ast.name))
      if (scopedLambda) {
        const argValues: LambdaArgument[] = ast.args.map((a) => evaluateLambdaArg(a, ctx))
        return applyLambda(scopedLambda, argValues, ctx, evaluate)
      }

      // LAMBDA dispatch: a `NameBinding` of `kind:'lambda'` registered
      // via `Workbook.defineName(...)` can be invoked with positional
      // args. The body re-evaluates against the current `ctx` plus a
      // scope that maps each declared param to its argument value.
      // Missing args bind to BLANK so partial-application errors surface
      // inside the body rather than at call site (matches Excel).
      //
      // Recursion guard: each LAMBDA application bumps a shared depth
      // counter and surfaces `#NUM!` past `MAX_LAMBDA_CALL_DEPTH` (Rust
      // parity, see `NAMED_CALL_DEPTH` in `excel/rust/excel-core/src/eval.rs`).
      // Without this, a pathological recursion like `bad(n) = bad(n)`
      // would blow the JS stack instead of yielding a sensible error.
      const binding = ctx.resolveName(ast.name)
      if (binding && binding.kind === 'lambda') {
        const argValues: LambdaArgument[] = ast.args.map((a) => evaluateLambdaArg(a, ctx))
        return applyLambda(binding, argValues, ctx, evaluate)
      }

      const argValues: Value[] = ast.args.map((a) => evaluateFunctionArg(a, ctx))
      const custom = ctx.callCustom(ast.name, argValues, {
        sheetName: ctx.currentSheetName,
        cell: ctx.currentCell,
      })
      if (custom !== undefined) return custom
      return ERR('#NAME?', `function '${ast.name}' is not registered`)
    }
  }
}

export function evaluateFunctionArg(expr: Expr, ctx: EvalContext): Value {
  if (expr.kind === 'multiArea') {
    return evaluateMultiAreaArg(expr.areas, ctx)
  }
  return evaluate(expr, ctx)
}

function evaluateLambdaArg(expr: Expr, ctx: EvalContext): LambdaArgument {
  const resolved = resolveLambdaExpr(expr, ctx)
  if (resolved.error) return resolved.error
  if (resolved.lambda) return { kind: 'lambdaArgument', lambda: resolved.lambda }
  const ref = runtimeRefFromExpr(expr, ctx)
  if (ref.ok) return { kind: 'referenceArgument', ref: ref.ref }
  if (ref.error) return ref.error
  return evaluateFunctionArg(expr, ctx)
}

function evaluateIf(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  if (args.length < 2 || args.length > 3) {
    return ERR('#VALUE!', 'IF expects 2 or 3 arguments')
  }
  const cond = evaluateFunctionArg(args[0], ctx)
  if (cond.kind === 'error') return cond
  if (cond.kind === 'array') return evaluateArrayIf(cond, args, ctx, evaluateFunctionArg)
  const coerced = toBoolean(cond)
  if (!coerced.ok) return coerced.error
  if (coerced.value) return evaluateFunctionArg(args[1], ctx)
  return args.length === 3
    ? evaluateFunctionArg(args[2], ctx)
    : { kind: 'boolean', value: false }
}

function evaluateIfError(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  if (args.length !== 2) return ERR('#VALUE!')
  const value = evaluateFunctionArg(args[0], ctx)
  if (value.kind === 'array') return evaluateArrayIfError(value, args[1], ctx, () => true, evaluateFunctionArg)
  return value.kind === 'error' ? evaluateFunctionArg(args[1], ctx) : value
}

function evaluateIfNa(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  if (args.length !== 2) return ERR('#VALUE!')
  const value = evaluateFunctionArg(args[0], ctx)
  if (value.kind === 'array') {
    return evaluateArrayIfError(value, args[1], ctx, (error) => error.code === '#N/A', evaluateFunctionArg)
  }
  return value.kind === 'error' && value.code === '#N/A'
    ? evaluateFunctionArg(args[1], ctx)
    : value
}

function evaluateIfs(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  if (args.length === 0 || args.length % 2 !== 0) return ERR('#VALUE!')
  const pairCount = Math.floor(args.length / 2)
  for (let i = 0; i < pairCount; i += 1) {
    const cond = evaluateFunctionArg(args[i * 2], ctx)
    if (cond.kind === 'error') return cond
    if (cond.kind === 'array') return evaluateArrayIfs(args, ctx, i, cond, evaluateFunctionArg)
    const coerced = toBoolean(cond)
    if (!coerced.ok) return coerced.error
    if (coerced.value) return evaluateFunctionArg(args[i * 2 + 1], ctx)
  }
  return ERR('#N/A')
}

function evaluateSwitch(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  if (args.length < 3) return ERR('#VALUE!')
  const expr = evaluateFunctionArg(args[0], ctx)
  if (expr.kind === 'error') return expr
  if (expr.kind === 'array') return evaluateArraySwitch(expr, args, ctx, evaluateFunctionArg)
  const rest = args.length - 1
  const pairCount = Math.floor(rest / 2)
  const hasDefault = rest % 2 === 1
  for (let i = 0; i < pairCount; i += 1) {
    const caseValue = evaluateFunctionArg(args[1 + i * 2], ctx)
    if (caseValue.kind === 'error') return caseValue
    if (excelEquals(expr, caseValue)) return evaluateFunctionArg(args[1 + i * 2 + 1], ctx)
  }
  return hasDefault ? evaluateFunctionArg(args[args.length - 1], ctx) : ERR('#N/A')
}

function evaluateMultiAreaArg(
  areas: ReadonlyArray<Expr>,
  ctx: EvalContext,
): Value {
  const rows: Value[][] = []
  for (const area of areas) {
    const resolved = runtimeRefFromExpr(area, ctx)
    if (!resolved.ok) return resolved.error ?? ERR('#VALUE!')
    const value = evaluateRuntimeRef(resolved.ref, ctx)
    if (value.kind === 'error') return value
    if (value.kind === 'array') {
      for (const row of value.value) {
        for (const cell of row) rows.push([cell])
      }
    } else {
      rows.push([value])
    }
  }
  if (rows.length === 0) return ERR('#VALUE!')
  return arrayResult(rows, 'multi-area result')
}

function evaluateIndex(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  const ref = runtimeRefFromIndexArgs(args, ctx)
  if (ref.ok) return evaluateRuntimeRef(ref.ref, ctx)
  if (ref.error && isIndexReferenceSource(args[0], ctx)) return ref.error

  const builtin = getBuiltinFunction('INDEX')
  if (!builtin) return ERR('#NAME?', "function 'INDEX' is not registered")
  const argValues: Value[] = args.map((a) => evaluateFunctionArg(a, ctx))
  return builtin(argValues, ctx)
}

function isIndexReferenceSource(expr: Expr | undefined, ctx: EvalContext): boolean {
  if (!expr) return false
  if (
    expr.kind === 'ref' ||
    expr.kind === 'range' ||
    expr.kind === 'dynamicRange' ||
    expr.kind === 'spillRef' ||
    expr.kind === 'crossSheet' ||
    expr.kind === 'multiArea'
  ) {
    return true
  }
  if (expr.kind === 'name') {
    const name = canonicalName(expr.name)
    if (ctx.lambdaScope?.get(name) !== undefined) return false
    if (ctx.lambdaRefScope?.has(name)) return true
    return ctx.resolveName(expr.name)?.kind === 'range'
  }
  if (expr.kind !== 'call') return false
  const upper = expr.name.toUpperCase()
  return upper === 'OFFSET' || upper === 'INDIRECT' || upper === 'CHOOSE'
}

function evaluateIndirect(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  const resolved = runtimeRefFromIndirectArgs(args, ctx)
  if (!resolved.ok) return resolved.error ?? ERR('#REF!')
  return evaluateRuntimeRef(resolved.ref, ctx)
}

function evaluateOffset(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  const resolved = runtimeRefFromOffsetArgs(args, ctx)
  if (!resolved.ok) return resolved.error ?? ERR('#VALUE!')
  return evaluateRuntimeRef(resolved.ref, ctx)
}

function evaluateSpillRef(
  expr: Extract<Expr, { readonly kind: 'spillRef' }>,
  ctx: EvalContext,
): Value {
  const resolved = runtimeRefFromSpillRef(expr, ctx)
  if (!resolved.ok) return resolved.error ?? ERR('#REF!')
  if (resolved.ref.materialized) return arrayResult(resolved.ref.materialized, 'range result')
  return evaluateRuntimeRef(resolved.ref, ctx)
}

function evaluateLet(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  if (args.length < 3 || args.length % 2 === 0) {
    return ERR('#VALUE!', 'LET expects name/value pairs plus a result expression')
  }

  const valueScope = new Map<string, Value>(ctx.lambdaScope ?? [])
  const refScope = new Map<string, RuntimeRef>(ctx.lambdaRefScope ?? [])
  const functionScope = new Map<string, LambdaBinding>(ctx.lambdaFunctionScope ?? [])
  const omitted = ctx.lambdaOmittedParams
    ? new Set<string>(ctx.lambdaOmittedParams)
    : undefined
  const subCtx: EvalContext = {
    ...ctx,
    lambdaScope: valueScope,
    lambdaRefScope: refScope,
    lambdaFunctionScope: functionScope,
    lambdaOmittedParams: omitted,
  }

  for (let i = 0; i < args.length - 1; i += 2) {
    const nameExpr = args[i]
    if (nameExpr.kind !== 'name') {
      return ERR('#NAME?', 'LET binding name must be an identifier')
    }
    const name = canonicalName(nameExpr.name)
    const lambda = resolveLambdaExpr(args[i + 1], subCtx)
    if (lambda.error) return lambda.error
    if (lambda.lambda) {
      const recursive = bindLambdaSelf(name, lambda.lambda)
      functionScope.set(name, recursive)
      valueScope.delete(name)
      refScope.delete(name)
      omitted?.delete(name)
      continue
    }

    const ref = runtimeRefFromExpr(args[i + 1], subCtx)
    if (ref.ok) {
      const sheetError = validateRuntimeRefSheet(ref.ref, subCtx)
      if (sheetError) return sheetError
      refScope.set(name, ref.ref)
      valueScope.delete(name)
      functionScope.delete(name)
      omitted?.delete(name)
      continue
    }
    if (ref.error) return ref.error

    const value = evaluate(args[i + 1], subCtx)
    if (value.kind === 'error') return value
    valueScope.set(name, value)
    refScope.delete(name)
    functionScope.delete(name)
    omitted?.delete(name)
  }

  return evaluate(args[args.length - 1], subCtx)
}

function evaluateIsOmitted(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  if (args.length !== 1) return ERR('#VALUE!', 'ISOMITTED expects 1 argument')
  if (!ctx.lambdaOmittedParams) return ERR('#NAME?')
  const arg = args[0]
  if (arg.kind === 'name' && ctx.lambdaOmittedParams?.has(canonicalName(arg.name))) {
    return { kind: 'boolean', value: true }
  }
  const value = evaluate(arg, ctx)
  if (value.kind === 'error') return value
  return { kind: 'boolean', value: false }
}

function evaluateMap(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  if (args.length < 2) return ERR('#VALUE!', 'MAP expects at least 2 arguments')
  const lambda = requireLambda(args[args.length - 1], ctx, args.length - 1)
  if (lambda.error) return lambda.error

  // Whole-column / whole-row inputs (e.g. `MAP(A:A, ...)`) would force a
  // 1,048,576-row materialization through `evaluateGrid` and trip the
  // range-materialization cap. Detect a single-arg sparse ref and
  // iterate only the non-empty cells from the sheet snapshot.
  if (args.length === 2) {
    const sparseResult = evaluateMapSparse(args[0], lambda.lambda, ctx)
    if (sparseResult) return sparseResult
  }

  const grids: Grid[] = []
  for (const arg of args.slice(0, -1)) {
    const grid = evaluateGrid(arg, ctx)
    if (grid.error) return grid.error
    grids.push(grid.grid)
  }
  const first = grids[0]
  if (!first || first.rows === 0 || first.cols === 0) return ERR('#VALUE!')
  const shapeError = arrayShapeError(first.rows, first.cols, 'MAP result')
  if (shapeError) return shapeError
  for (const grid of grids.slice(1)) {
    if (grid.rows !== first.rows || grid.cols !== first.cols) {
      return ERR('#VALUE!', 'MAP input arrays must have the same shape')
    }
  }
  const out = makeMatrix(first.rows, first.cols)
  for (let r = 0; r < first.rows; r += 1) {
    for (let c = 0; c < first.cols; c += 1) {
      const values = grids.map((grid) => grid.cells[r][c])
      const result = applyLambdaForArrayCell(lambda.lambda, values, ctx, evaluate)
      if (!result.ok) return result.error
      out[r][c] = result.value
    }
  }
  return arrayResult(out, 'MAP result')
}

/**
 * Sparse MAP path: when the single source argument is a whole-column or
 * whole-row reference, iterate only the non-empty cells from the sheet
 * snapshot. Returns `undefined` to defer to the materialized path when
 * the input does not qualify.
 *
 * The result is a 1-column vector of mapped non-empty values, in
 * row-major coord order of the sheet — we deliberately drop blank cells
 * rather than producing a 1,048,576-row sparse result.
 */
function evaluateMapSparse(
  expr: Expr,
  lambda: LambdaBinding,
  ctx: EvalContext,
): Value | undefined {
  const ref = runtimeRefFromExpr(expr, ctx)
  if (!ref.ok) return undefined
  if (!canSparseIterate(ref.ref)) return undefined
  const sheetError = validateRuntimeRefSheet(ref.ref, ctx)
  if (sheetError) return sheetError

  const sparse = sparseValuesForRef(ref.ref, ctx)
  if (!sparse.ok) return sparse.error

  const out: Value[][] = []
  for (const { value } of sparse.values) {
    if (value.kind === 'blank') continue
    const result = applyLambdaForArrayCell(lambda, [value], ctx, evaluate)
    if (!result.ok) return result.error
    out.push([result.value])
  }
  if (out.length === 0) return ERR('#CALC!', 'MAP produced no rows')
  return arrayResult(out, 'MAP result')
}

function evaluateReduce(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  if (args.length !== 3) return ERR('#VALUE!', 'REDUCE expects 3 arguments')
  const initial = evaluate(args[0], ctx)
  if (initial.kind === 'error') return initial
  const grid = evaluateGrid(args[1], ctx)
  if (grid.error) return grid.error
  const shapeError = arrayShapeError(grid.grid.rows, grid.grid.cols, 'REDUCE input')
  if (shapeError) return shapeError
  const lambda = requireLambda(args[2], ctx, 2)
  if (lambda.error) return lambda.error
  let acc: Value = initial
  for (let r = 0; r < grid.grid.rows; r += 1) {
    for (let c = 0; c < grid.grid.cols; c += 1) {
      acc = applyLambda(lambda.lambda, [acc, grid.grid.cells[r][c]], ctx, evaluate)
      if (acc.kind === 'error') return acc
    }
  }
  return acc
}

function evaluateScan(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  if (args.length !== 3) return ERR('#VALUE!', 'SCAN expects 3 arguments')
  const initial = evaluate(args[0], ctx)
  if (initial.kind === 'error') return initial
  const grid = evaluateGrid(args[1], ctx)
  if (grid.error) return grid.error
  const lambda = requireLambda(args[2], ctx, 2)
  if (lambda.error) return lambda.error
  const shapeError = arrayShapeError(grid.grid.rows, grid.grid.cols, 'SCAN result')
  if (shapeError) return shapeError
  const out = makeMatrix(grid.grid.rows, grid.grid.cols)
  let acc: Value = initial
  for (let r = 0; r < grid.grid.rows; r += 1) {
    for (let c = 0; c < grid.grid.cols; c += 1) {
      const result = applyLambdaForArrayCell(
        lambda.lambda,
        [acc, grid.grid.cells[r][c]],
        ctx,
        evaluate,
      )
      if (!result.ok) return result.error
      acc = result.value
      out[r][c] = result.value
    }
  }
  return arrayResult(out, 'SCAN result')
}

function evaluateByRow(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  if (args.length !== 2) return ERR('#VALUE!', 'BYROW expects 2 arguments')
  const grid = evaluateGrid(args[0], ctx)
  if (grid.error) return grid.error
  const inputShapeError = arrayShapeError(grid.grid.rows, grid.grid.cols, 'BYROW input')
  if (inputShapeError) return inputShapeError
  const outputShapeError = arrayShapeError(grid.grid.rows, 1, 'BYROW result')
  if (outputShapeError) return outputShapeError
  const lambda = requireLambda(args[1], ctx, 1)
  if (lambda.error) return lambda.error
  const out = makeMatrix(grid.grid.rows, 1)
  for (let r = 0; r < grid.grid.rows; r += 1) {
    const rowArray: Value = { kind: 'array', value: [grid.grid.cells[r].slice()] }
    const result = applyLambdaForArrayCell(lambda.lambda, [rowArray], ctx, evaluate)
    if (!result.ok) return result.error
    out[r][0] = result.value
  }
  return arrayResult(out, 'BYROW result')
}

function evaluateByCol(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  if (args.length !== 2) return ERR('#VALUE!', 'BYCOL expects 2 arguments')
  const grid = evaluateGrid(args[0], ctx)
  if (grid.error) return grid.error
  const inputShapeError = arrayShapeError(grid.grid.rows, grid.grid.cols, 'BYCOL input')
  if (inputShapeError) return inputShapeError
  const outputShapeError = arrayShapeError(1, grid.grid.cols, 'BYCOL result')
  if (outputShapeError) return outputShapeError
  const lambda = requireLambda(args[1], ctx, 1)
  if (lambda.error) return lambda.error
  const out = makeMatrix(1, grid.grid.cols)
  for (let c = 0; c < grid.grid.cols; c += 1) {
    const col: Value[][] = []
    for (let r = 0; r < grid.grid.rows; r += 1) {
      col.push([grid.grid.cells[r][c]])
    }
    const result = applyLambdaForArrayCell(lambda.lambda, [{ kind: 'array', value: col }], ctx, evaluate)
    if (!result.ok) return result.error
    out[0][c] = result.value
  }
  return arrayResult(out, 'BYCOL result')
}

function evaluateMakeArray(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  if (args.length !== 3) return ERR('#VALUE!', 'MAKEARRAY expects 3 arguments')
  const rowsValue = evaluate(args[0], ctx)
  if (rowsValue.kind === 'error') return rowsValue
  const colsValue = evaluate(args[1], ctx)
  if (colsValue.kind === 'error') return colsValue
  const rowsNumber = toNumber(rowsValue)
  if (!rowsNumber.ok) return rowsNumber.error
  const colsNumber = toNumber(colsValue)
  if (!colsNumber.ok) return colsNumber.error
  const rows = Math.trunc(rowsNumber.value)
  const cols = Math.trunc(colsNumber.value)
  if (rows < 1 || cols < 1 || !Number.isFinite(rows) || !Number.isFinite(cols)) {
    return ERR('#VALUE!', 'MAKEARRAY dimensions must be positive')
  }
  const shapeError = arrayShapeError(rows, cols, 'MAKEARRAY result')
  if (shapeError) return shapeError
  const lambda = requireLambda(args[2], ctx, 2)
  if (lambda.error) return lambda.error
  const out = makeMatrix(rows, cols)
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const result = applyLambdaForArrayCell(
        lambda.lambda,
        [
          { kind: 'number', value: r + 1 },
          { kind: 'number', value: c + 1 },
        ],
        ctx,
        evaluate,
      )
      if (!result.ok) return result.error
      out[r][c] = result.value
    }
  }
  return arrayResult(out, 'MAKEARRAY result')
}

function evaluateFilter(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  if (args.length < 2 || args.length > 3) return ERR('#VALUE!', 'FILTER needs 2-3 args')

  // Whole-column / whole-row inputs (e.g. `FILTER(A:A, A:A > 1)`) would
  // force 1M-row materialization on both args. Detect the case where
  // the array arg and the include arg share the same sparse-iterable
  // ref (typical shape: `FILTER(R, R op scalar)`) and iterate only the
  // non-empty cells from the sheet snapshot.
  const sparseResult = evaluateFilterSparse(args, ctx)
  if (sparseResult) return sparseResult

  const filtered = selectFilterRows(args[0], args[1], ctx)
  if (!filtered.ok) return filtered.error
  if (filtered.rows.length === 0 || filtered.rows[0]?.length === 0) {
    if (args.length === 3) return evaluateFunctionArg(args[2], ctx)
    return ERR('#CALC!', 'FILTER returned empty result')
  }
  return arrayResult(filtered.rows, 'FILTER result')
}

/**
 * Sparse FILTER path: returns a value when the array arg is a sparse
 * ref and the include arg is a `binary` comparison whose operands are
 * (the same ref) and (a scalar). For each non-empty cell we materialize
 * a 1×1 array binary against the scalar and check truthiness. Returns
 * `undefined` to fall back to the materializing path.
 */
function evaluateFilterSparse(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): Value | undefined {
  if (args.length < 2) return undefined
  const arrayRef = runtimeRefFromExpr(args[0], ctx)
  if (!arrayRef.ok) return undefined
  if (!canSparseIterate(arrayRef.ref)) return undefined
  const sheetError = validateRuntimeRefSheet(arrayRef.ref, ctx)
  if (sheetError) return sheetError

  const include = args[1]
  if (include.kind !== 'binary') return undefined
  // Identify which side is the same ref as the array arg, and which is
  // the scalar. The ref-side need not be byte-identical but must be a
  // runtime ref to the same range (so `A:A > 1` and `$A:$A > 1` both work).
  const leftRef = runtimeRefFromExpr(include.left, ctx)
  const rightRef = runtimeRefFromExpr(include.right, ctx)
  let scalarExpr: Expr
  if (leftRef.ok && sameRuntimeRefRange(leftRef.ref, arrayRef.ref)) {
    scalarExpr = include.right
  } else if (rightRef.ok && sameRuntimeRefRange(rightRef.ref, arrayRef.ref)) {
    scalarExpr = include.left
  } else {
    return undefined
  }
  const scalar = evaluate(scalarExpr, ctx)
  if (scalar.kind === 'error') return scalar
  if (scalar.kind === 'array') return undefined

  const sparse = sparseValuesForRef(arrayRef.ref, ctx)
  if (!sparse.ok) return sparse.error

  const out: Value[][] = []
  const leftIsRef = leftRef.ok && sameRuntimeRefRange(leftRef.ref, arrayRef.ref)
  for (const { value } of sparse.values) {
    if (value.kind === 'blank') continue
    const cmp = leftIsRef
      ? applyBinary(include.op, value, scalar)
      : applyBinary(include.op, scalar, value)
    if (cmp.kind === 'error') return cmp
    const bool = toBoolean(cmp)
    if (!bool.ok) return bool.error
    if (bool.value) out.push([value])
  }
  if (out.length === 0) {
    if (args.length === 3) return evaluateFunctionArg(args[2], ctx)
    return ERR('#CALC!', 'FILTER returned empty result')
  }
  return arrayResult(out, 'FILTER result')
}

/**
 * Sparse TOCOL path: when the source argument is a whole-column or
 * whole-row reference, iterate only the non-empty cells from the sheet
 * snapshot. The `ignore` and `scan_by_column` modes are forwarded
 * unchanged; for a 1-D ref the scan direction does not matter.
 *
 * Returns `undefined` to fall back to the regular built-in dispatch
 * when the input does not qualify (e.g. inline array literal).
 */
function evaluateTocolSparse(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): Value | undefined {
  if (args.length < 1 || args.length > 3) return undefined
  const ref = runtimeRefFromExpr(args[0], ctx)
  if (!ref.ok) return undefined
  if (!canSparseIterate(ref.ref)) return undefined
  const sheetError = validateRuntimeRefSheet(ref.ref, ctx)
  if (sheetError) return sheetError

  // Resolve ignore mode (0 = keep all; 1 = ignore blanks; 2 = ignore
  // errors; 3 = ignore both). Sparse iteration already skips blanks
  // implicitly because the snapshot only contains stored cells; for
  // modes 0 and 2 we re-introduce blanks would be wrong, so we keep
  // the sparse behavior — blanks were never authored, so dropping
  // them matches what Excel would render for `TOCOL(A:A, 0)` once it
  // ran out of column-length budget.
  let ignoreMode = 0
  if (args.length >= 2) {
    const v = evaluateFunctionArg(args[1], ctx)
    if (v.kind === 'error') return v
    const num = toNumber(v)
    if (!num.ok) return num.error
    const m = Math.trunc(num.value)
    if (m < 0 || m > 3) return ERR('#VALUE!')
    ignoreMode = m
  }

  const sparse = sparseValuesForRef(ref.ref, ctx)
  if (!sparse.ok) return sparse.error

  const ignoreError = ignoreMode === 2 || ignoreMode === 3
  const out: Value[] = []
  for (const { value } of sparse.values) {
    if (value.kind === 'blank') continue
    if (ignoreError && value.kind === 'error') continue
    out.push(value)
  }
  if (out.length === 0) return ERR('#CALC!')
  return arrayResult(out.map((v) => [v]), 'TOCOL result')
}

function evaluateTakeDrop(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  mode: 'take' | 'drop',
): Value | undefined {
  if (args.length < 2 || args.length > 3) {
    return ERR('#VALUE!', `${mode.toUpperCase()} needs 2-3 args`)
  }

  const source = runtimeRefFromExpr(args[0], ctx)
  if (!source.ok) return source.error ?? undefined
  const sheetError = validateRuntimeRefSheet(source.ref, ctx)
  if (sheetError) return sheetError

  const rows = source.ref.range.rowEnd - source.ref.range.rowStart + 1
  const cols = source.ref.range.colEnd - source.ref.range.colStart + 1
  const rowCount = evaluateArrayIntegerArg(args[1], ctx)
  if (!rowCount.ok) return rowCount.error
  const rowRange = mode === 'take'
    ? takeSliceRange(rows, rowCount.value)
    : dropSliceRange(rows, rowCount.value)
  if (!rowRange.ok) return rowRange.error

  let colStart = 0
  let colEnd = cols
  if (args.length === 3) {
    const colCount = evaluateArrayIntegerArg(args[2], ctx)
    if (!colCount.ok) return colCount.error
    const colRange = mode === 'take'
      ? takeSliceRange(cols, colCount.value)
      : dropSliceRange(cols, colCount.value)
    if (!colRange.ok) return colRange.error
    colStart = colRange.start
    colEnd = colRange.end
  }

  const outRows = rowRange.end - rowRange.start
  const outCols = colEnd - colStart
  const shapeError = arrayShapeError(outRows, outCols, `${mode.toUpperCase()} result`)
  if (shapeError) return shapeError

  return arrayResult(
    materializeRuntimeRefSlice(
      source.ref,
      rowRange.start,
      rowRange.end,
      colStart,
      colEnd,
      ctx,
    ),
    `${mode.toUpperCase()} result`,
  )
}

function evaluateArrayIntegerArg(
  expr: Expr,
  ctx: EvalContext,
): IntegerArgResult {
  const value = evaluateFunctionArg(expr, ctx)
  if (value.kind === 'error') return { ok: false, error: value }
  const n = toNumber(value)
  if (!n.ok) return { ok: false, error: n.error }
  if (!Number.isFinite(n.value)) return { ok: false, error: ERR('#NUM!') }
  return { ok: true, value: Math.trunc(n.value) }
}

function takeSliceRange(size: number, count: number): SliceRangeResult {
  if (count === 0) return { ok: false, error: ERR('#CALC!') }
  const n = Math.min(Math.abs(count), size)
  if (n === 0) return { ok: false, error: ERR('#CALC!') }
  if (count > 0) return { ok: true, start: 0, end: n }
  return { ok: true, start: size - n, end: size }
}

function dropSliceRange(size: number, count: number): SliceRangeResult {
  if (count === 0) return { ok: false, error: ERR('#CALC!') }
  if (count > 0) {
    const start = Math.min(count, size)
    if (start >= size) return { ok: false, error: ERR('#CALC!') }
    return { ok: true, start, end: size }
  }
  const end = Math.max(0, size + count)
  if (end <= 0) return { ok: false, error: ERR('#CALC!') }
  return { ok: true, start: 0, end }
}

function materializeRuntimeRefSlice(
  ref: RuntimeRef,
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number,
  ctx: EvalContext,
): Value[][] {
  const out: Value[][] = []
  for (let r = rowStart; r < rowEnd; r += 1) {
    const row: Value[] = []
    for (let c = colStart; c < colEnd; c += 1) {
      if (ref.materialized) {
        row.push(ref.materialized[r]?.[c] ?? BLANK)
      } else {
        row.push(valueAtRuntimeCoord(
          ref.sheetName,
          { row: ref.range.rowStart + r, col: ref.range.colStart + c },
          ctx,
        ))
      }
    }
    out.push(row)
  }
  return out
}

function evaluateChoose(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  if (args.length < 2) return ERR('#VALUE!')
  const indexValue = evaluateFunctionArg(args[0], ctx)
  if (indexValue.kind === 'error') return indexValue
  if (indexValue.kind === 'array') return evaluateArrayChoose(indexValue, args, ctx, evaluateFunctionArg)
  const selected = chooseSelectedExpr(args, ctx)
  if (!selected.ok) return selected.error
  return evaluateFunctionArg(selected.expr, ctx)
}

function evaluateXLookup(args: ReadonlyArray<Expr>, ctx: EvalContext): Value {
  const result = evaluateXLookupMatch(args, ctx)
  switch (result.kind) {
    case 'value':
      return result.value
    case 'error':
      return result.error
    case 'notFound':
      if (args.length >= 4) return evaluateFunctionArg(args[3], ctx)
      return ERR('#N/A')
  }
}

function evaluateXLookupMatch(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): XLookupCoreResult {
  if (args.length < 3 || args.length > 6) return { kind: 'error', error: ERR('#VALUE!') }

  const needle = evaluateFunctionArg(args[0], ctx)
  if (needle.kind === 'error') return { kind: 'error', error: needle }
  const lookupValue = evaluateFunctionArg(args[1], ctx)
  if (lookupValue.kind === 'error') return { kind: 'error', error: lookupValue }
  const returnValue = evaluateFunctionArg(args[2], ctx)
  if (returnValue.kind === 'error') return { kind: 'error', error: returnValue }
  const matchMode = args.length >= 5 ? evaluateFunctionArg(args[4], ctx) : undefined
  if (matchMode?.kind === 'error') return { kind: 'error', error: matchMode }
  const searchMode = args.length >= 6 ? evaluateFunctionArg(args[5], ctx) : undefined
  if (searchMode?.kind === 'error') return { kind: 'error', error: searchMode }

  return resolveXLookupValue(needle, lookupValue, returnValue, matchMode, searchMode)
}

type FilterRowsResult =
  | { readonly ok: true; readonly rows: Value[][] }
  | { readonly ok: false; readonly error: Value }

function selectFilterRows(arrayExpr: Expr, includeExpr: Expr, ctx: EvalContext): FilterRowsResult {
  const arrayGrid = evaluateGrid(arrayExpr, ctx)
  if (arrayGrid.error) return { ok: false, error: arrayGrid.error }
  const includeGrid = evaluateGrid(includeExpr, ctx)
  if (includeGrid.error) return { ok: false, error: includeGrid.error }

  const rows = arrayGrid.grid.rows
  const cols = arrayGrid.grid.cols
  const maskRows = includeGrid.grid.rows
  const maskCols = includeGrid.grid.cols
  const outRows: Value[][] = []

  if (maskRows === rows && maskCols === 1) {
    for (let r = 0; r < rows; r += 1) {
      const coerced = toBoolean(includeGrid.grid.cells[r][0])
      if (!coerced.ok) return { ok: false, error: coerced.error }
      if (coerced.value) outRows.push(arrayGrid.grid.cells[r].slice())
    }
    return { ok: true, rows: outRows }
  }

  if (maskCols === cols && maskRows === 1) {
    const keptCols: number[] = []
    for (let c = 0; c < cols; c += 1) {
      const coerced = toBoolean(includeGrid.grid.cells[0][c])
      if (!coerced.ok) return { ok: false, error: coerced.error }
      if (coerced.value) keptCols.push(c)
    }
    return {
      ok: true,
      rows: arrayGrid.grid.cells.map((row) => keptCols.map((c) => row[c])),
    }
  }

  return { ok: false, error: ERR('#VALUE!', 'FILTER mask shape mismatch') }
}

function requireLambda(
  expr: Expr,
  ctx: EvalContext,
  arity: number,
): { readonly lambda: LambdaBinding; readonly error?: undefined } | { readonly error: Value } {
  const resolved = resolveLambdaExpr(expr, ctx)
  if (resolved.error) return { error: resolved.error }
  if (!resolved.lambda) return { error: ERR('#VALUE!', 'expected LAMBDA') }
  if (resolved.lambda.params.length !== arity) {
    return { error: ERR('#VALUE!', `LAMBDA expects ${arity} parameters`) }
  }
  return { lambda: resolved.lambda }
}

function resolveLambdaExpr(expr: Expr, ctx: EvalContext): LambdaResolveResult {
  if (expr.kind === 'call' && expr.name.toUpperCase() === 'LAMBDA') {
    return makeLambdaBinding(expr.args, ctx)
  }
  if (expr.kind === 'lambdaCall') {
    return resolveLambdaCallResult(expr.callee, expr.args, ctx)
  }
  if (expr.kind === 'name') {
    const scoped = ctx.lambdaFunctionScope?.get(canonicalName(expr.name))
    if (scoped) return { lambda: scoped }
    const binding = ctx.resolveName(expr.name)
    if (binding?.kind === 'lambda') return { lambda: binding }
    return {}
  }
  if (expr.kind === 'call') {
    return resolveLambdaReturningCall(expr, ctx)
  }
  return {}
}

function resolveLambdaCallResult(
  callee: Expr,
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): LambdaResolveResult {
  const resolved = resolveLambdaExpr(callee, ctx)
  if (resolved.error) return resolved
  if (!resolved.lambda) {
    const value = evaluate(callee, ctx)
    return value.kind === 'error' ? { error: value } : {}
  }

  return resolveAppliedLambdaResult(resolved.lambda, args, ctx)
}

function resolveLambdaReturningCall(call: CallExpr, ctx: EvalContext): LambdaResolveResult {
  const upper = call.name.toUpperCase()
  switch (upper) {
    case 'IF':
      return resolveIfResultAsLambda(call.args, ctx)
    case 'IFERROR':
      return resolveIfErrorResultAsLambda(call.args, ctx)
    case 'IFNA':
      return resolveIfNaResultAsLambda(call.args, ctx)
    case 'IFS':
      return resolveIfsResultAsLambda(call.args, ctx)
    case 'SWITCH':
      return resolveSwitchResultAsLambda(call.args, ctx)
    case 'CHOOSE':
      return resolveChooseResultAsLambda(call.args, ctx)
    case 'FILTER':
      return resolveFilterResultAsLambda(call.args, ctx)
    case 'XLOOKUP':
      return resolveXLookupResultAsLambda(call.args, ctx)
    case 'LET':
      return resolveLetResultAsLambda(call.args, ctx)
  }

  const scoped = ctx.lambdaFunctionScope?.get(canonicalName(call.name))
  if (scoped) return resolveAppliedLambdaResult(scoped, call.args, ctx)
  const binding = ctx.resolveName(call.name)
  if (binding?.kind === 'lambda') return resolveAppliedLambdaResult(binding, call.args, ctx)
  return {}
}

function resolveIfResultAsLambda(args: ReadonlyArray<Expr>, ctx: EvalContext): LambdaResolveResult {
  if (args.length < 2 || args.length > 3) {
    return { error: ERR('#VALUE!', 'IF expects 2 or 3 arguments') }
  }
  const cond = evaluate(args[0], ctx)
  if (cond.kind === 'error') return { error: cond }
  const coerced = toBoolean(cond)
  if (!coerced.ok) return { error: coerced.error }
  if (coerced.value) return resolveLambdaOrValueError(args[1], ctx)
  return args.length === 3 ? resolveLambdaOrValueError(args[2], ctx) : {}
}

function resolveIfErrorResultAsLambda(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): LambdaResolveResult {
  if (args.length !== 2) return { error: ERR('#VALUE!') }
  const valueLambda = resolveLambdaExpr(args[0], ctx)
  if (valueLambda.lambda) return valueLambda
  if (valueLambda.error) return resolveLambdaOrValueError(args[1], ctx)
  const value = evaluateFunctionArg(args[0], ctx)
  return value.kind === 'error' ? resolveLambdaOrValueError(args[1], ctx) : {}
}

function resolveIfNaResultAsLambda(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): LambdaResolveResult {
  if (args.length !== 2) return { error: ERR('#VALUE!') }
  const valueLambda = resolveLambdaExpr(args[0], ctx)
  if (valueLambda.lambda) return valueLambda
  if (valueLambda.error) {
    return valueLambda.error.kind === 'error' && valueLambda.error.code === '#N/A'
      ? resolveLambdaOrValueError(args[1], ctx)
      : valueLambda
  }
  const value = evaluateFunctionArg(args[0], ctx)
  return value.kind === 'error' && value.code === '#N/A'
    ? resolveLambdaOrValueError(args[1], ctx)
    : {}
}

function resolveIfsResultAsLambda(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): LambdaResolveResult {
  if (args.length === 0) return { error: ERR('#VALUE!') }
  const pairCount = Math.floor(args.length / 2)
  for (let i = 0; i < pairCount; i += 1) {
    const cond = evaluateFunctionArg(args[i * 2], ctx)
    if (cond.kind === 'error') return { error: cond }
    const coerced = toBoolean(cond)
    if (!coerced.ok) return { error: coerced.error }
    if (coerced.value) return resolveLambdaOrValueError(args[i * 2 + 1], ctx)
  }
  return { error: ERR('#N/A') }
}

function resolveSwitchResultAsLambda(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): LambdaResolveResult {
  if (args.length < 3) return { error: ERR('#VALUE!') }
  const expr = evaluateFunctionArg(args[0], ctx)
  if (expr.kind === 'error') return { error: expr }
  const rest = args.length - 1
  const pairCount = Math.floor(rest / 2)
  const hasDefault = rest % 2 === 1
  for (let i = 0; i < pairCount; i += 1) {
    const caseValue = evaluateFunctionArg(args[1 + i * 2], ctx)
    if (caseValue.kind === 'error') return { error: caseValue }
    if (excelEquals(expr, caseValue)) return resolveLambdaOrValueError(args[1 + i * 2 + 1], ctx)
  }
  return hasDefault ? resolveLambdaOrValueError(args[args.length - 1], ctx) : { error: ERR('#N/A') }
}

function resolveChooseResultAsLambda(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): LambdaResolveResult {
  const selected = chooseSelectedExpr(args, ctx)
  if (!selected.ok) return { error: selected.error }
  return resolveLambdaOrValueError(selected.expr, ctx)
}

function resolveFilterResultAsLambda(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): LambdaResolveResult {
  if (args.length < 2 || args.length > 3) {
    return { error: ERR('#VALUE!', 'FILTER needs 2-3 args') }
  }
  const filtered = selectFilterRows(args[0], args[1], ctx)
  if (!filtered.ok) return { error: filtered.error }
  if (filtered.rows.length === 0 || filtered.rows[0]?.length === 0) {
    return args.length === 3
      ? resolveLambdaOrValueError(args[2], ctx)
      : { error: ERR('#CALC!', 'FILTER returned empty result') }
  }
  return {}
}

function resolveXLookupResultAsLambda(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): LambdaResolveResult {
  const result = evaluateXLookupMatch(args, ctx)
  switch (result.kind) {
    case 'value':
      return {}
    case 'error':
      return { error: result.error }
    case 'notFound':
      return args.length >= 4 ? resolveLambdaOrValueError(args[3], ctx) : { error: ERR('#N/A') }
  }
}

function resolveLetResultAsLambda(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): LambdaResolveResult {
  if (args.length < 3 || args.length % 2 === 0) {
    return { error: ERR('#VALUE!', 'LET expects name/value pairs plus a result expression') }
  }

  const valueScope = new Map<string, Value>(ctx.lambdaScope ?? [])
  const refScope = new Map<string, RuntimeRef>(ctx.lambdaRefScope ?? [])
  const functionScope = new Map<string, LambdaBinding>(ctx.lambdaFunctionScope ?? [])
  const omitted = ctx.lambdaOmittedParams
    ? new Set<string>(ctx.lambdaOmittedParams)
    : undefined
  const subCtx: EvalContext = {
    ...ctx,
    lambdaScope: valueScope,
    lambdaRefScope: refScope,
    lambdaFunctionScope: functionScope,
    lambdaOmittedParams: omitted,
  }

  for (let i = 0; i < args.length - 1; i += 2) {
    const nameExpr = args[i]
    if (nameExpr.kind !== 'name') {
      return { error: ERR('#NAME?', 'LET binding name must be an identifier') }
    }
    const name = canonicalName(nameExpr.name)
    const lambda = resolveLambdaExpr(args[i + 1], subCtx)
    if (lambda.error) return lambda
    if (lambda.lambda) {
      const recursive = bindLambdaSelf(name, lambda.lambda)
      functionScope.set(name, recursive)
      valueScope.delete(name)
      refScope.delete(name)
      omitted?.delete(name)
      continue
    }

    const ref = runtimeRefFromExpr(args[i + 1], subCtx)
    if (ref.ok) {
      const sheetError = validateRuntimeRefSheet(ref.ref, subCtx)
      if (sheetError) return { error: sheetError }
      refScope.set(name, ref.ref)
      valueScope.delete(name)
      functionScope.delete(name)
      omitted?.delete(name)
      continue
    }
    if (ref.error) return { error: ref.error }

    const value = evaluateFunctionArg(args[i + 1], subCtx)
    if (value.kind === 'error') return { error: value }
    valueScope.set(name, value)
    refScope.delete(name)
    functionScope.delete(name)
    omitted?.delete(name)
  }

  return resolveLambdaOrValueError(args[args.length - 1], subCtx)
}

function resolveAppliedLambdaResult(
  lambda: LambdaBinding,
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): LambdaResolveResult {
  const argValues: LambdaArgument[] = args.map((arg) => evaluateLambdaArg(arg, ctx))
  const prepared = prepareLambdaContext(lambda, argValues, ctx)
  if (!prepared.ok) return { error: prepared.error }
  prepared.depth.count += 1
  try {
    return resolveLambdaOrValueError(lambda.body, prepared.subCtx)
  } finally {
    prepared.depth.count -= 1
  }
}

function resolveLambdaOrValueError(expr: Expr, ctx: EvalContext): LambdaResolveResult {
  const resolved = resolveLambdaExpr(expr, ctx)
  if (resolved.error || resolved.lambda) return resolved
  const value = evaluate(expr, ctx)
  return value.kind === 'error' ? { error: value } : {}
}

function evaluateGrid(
  expr: Expr,
  ctx: EvalContext,
): { readonly grid: Grid; readonly error?: undefined } | { readonly error: Value } {
  const value = evaluate(expr, ctx)
  if (value.kind === 'error') return { error: value }
  return valueToGrid(value)
}

/**
 * Public entry: evaluate the cell at `rootKey` inside `rootCells` to a
 * concrete `Value`.
 *
 * 工作栈本体住在 `trampoline.ts`，它把「单格 AST 怎么求值」参数化了（否则两边
 * 成环）。这里就是把本文件的 `evaluate` 绑上去，对外仍是三参数签名 ——
 * `sheet.ts` 与本文件的跨表路径都按这个签名调用。
 */
/**
 * 递归读路径与跨表求值的三个绑定：实现分别住在 `cell-read.ts` / `foreign-sheet.ts`，
 * 它们把「单格 AST 怎么求值」参数化了（否则与本文件成环）。这里绑上本文件的
 * `evaluate`，对外与对内都保持原来的签名。
 */
export function refLookupGeneric(
  a1: string,
  cells: ReadonlyMap<CellKey, Cell>,
  ctx: EvalContext,
): Value {
  return refLookupIn(a1, cells, ctx, evaluate)
}

export function rangeLookupGeneric(
  start: string,
  end: string,
  cells: ReadonlyMap<CellKey, Cell>,
  ctx: EvalContext,
): Value[][] {
  return rangeLookupIn(start, end, cells, ctx, evaluate)
}

/**
 * 「把矩形读成值」的四个绑定：实现住在 `runtime-ref-read.ts`，同样把求值器参数化
 * 了。这里绑上本文件的 `evaluate`，对内对外都保持原来的签名 —— `sparse-*.ts` 按
 * `from './evaluate'` 取 `sparseValuesForRef` / `valueAtRuntimeCoord`。
 */
function evaluateRuntimeRef(ref: RuntimeRef, ctx: EvalContext, scalarTopLeft = false): Value {
  return evaluateRuntimeRefIn(ref, ctx, scalarTopLeft, evaluate)
}

export function sparseValuesForRef(
  ref: RuntimeRef,
  ctx: EvalContext,
): ReturnType<typeof sparseValuesForRefIn> {
  return sparseValuesForRefIn(ref, ctx, evaluate)
}

export function valueAtRuntimeCoord(
  sheetName: string | undefined,
  coord: CellCoord,
  ctx: EvalContext,
): Value {
  return valueAtRuntimeCoordIn(sheetName, coord, ctx, evaluate)
}

function rawValueAtRuntimeCoord(
  sheetName: string | undefined,
  coord: CellCoord,
  ctx: EvalContext,
): Value {
  return rawValueAtRuntimeCoordIn(sheetName, coord, ctx, evaluate)
}

function evaluateInForeignSheet(
  inner: Expr,
  parent: EvalContext,
  foreignCells: ReadonlyMap<CellKey, Cell>,
  sheetName?: string,
): Value {
  return evaluateInForeignSheetWith(inner, parent, foreignCells, sheetName, evaluate)
}

export function evaluateCellTrampolined(
  rootKey: CellKey,
  rootCells: ReadonlyMap<CellKey, Cell>,
  hostCtx: EvalContext,
): Value {
  return evaluateCellWithWorkStack(rootKey, rootCells, hostCtx, evaluate)
}

// ----------------------------------------------------------------------------
// 搬走之后的转口导出。
//
// 这些名字的实现已经下沉到各自的叶子模块，但 `sheet.ts` / `eval/index.ts` /
// `sparse-*.ts` / `spill-*.ts` / 测试仍按 `from './evaluate'` 取用它们。原样再
// 导出一遍，调用点一个字节都不用改。
//
// ⚠️ 这一行同时是两个**有意的环**的闭合点：`sparse-*.ts` 回读 `ERR` /
// `canSparseIterate` / `rangeCellCount` / `runtimeRefFromExpr` /
// `valueAtRuntimeCoord` / `sparseValuesForRef`，`spill-collision.ts` 与
// `spill-projection.ts` 回读 `ARRAY_CELL_CAP`。约束照旧：**禁止在那三族文件的
// 顶层求值从本文件导入的绑定**（只能在函数体里用），否则模块初始化顺序一变就是
// undefined。`spill-*` 那两条如果哪天想彻底解掉，把它们的 `ARRAY_CELL_CAP` 改成
// `from './array-shape'` 即可 —— 常量已经住在那儿了。
// ----------------------------------------------------------------------------
export {
  ERR,
  ARRAY_CELL_CAP,
  canSparseIterate,
  rangeCellCount,
  cycleGuardKey,
  parseRefToCoord,
  parseRefToKey,
}
