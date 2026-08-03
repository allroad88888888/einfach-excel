/**
 * 引用元数据函数。
 *
 * 职责：回答「这个引用**本身**是什么」的那一族函数 —— `SHEET` /
 * `SHEETS` /
 * `AREAS` / `ROW` / `COLUMN` / `ROWS` / `COLUMNS` / `CELL` / `ISREF` /
 * `ISFORMULA` / `FORMULATEXT`。它们要的是矩形的位置形状，不是格子里的
 * 值，所以必须在派发到内建函数表**之前**被截走 —— 内建函数只拿得到
 * 已经求好的 `Value`。
 *
 * 求值器、表达式→矩形的解析、矩形怎么读成值，三件都是**参数**
 * （`RefInfoDeps`）传进来的，不是 import 的：反向 import `evaluate.ts` 会成环。
 */
import type { EvalContext, Expr, Value } from '../types'
import { ERR } from './error-value'
import { arrayResult } from './array-shape'
import {
  cellForRuntimeRef,
  topLeftRuntimeRef,
  validateRuntimeRefSheet,
  type RuntimeRef,
} from './runtime-ref'
import type { RuntimeRefResult } from './runtime-ref-resolve'

/**
 * 本模块向求值器索取的三个回调。
 *
 * 传参而不是 import，是为了不与 `evaluate.ts` 成环 —— 参照
 * `spill-collision.ts` / `spill-projection.ts` 的形状。
 */
export interface RefInfoDeps {
  /** 单格 AST 的递归求值器（`evaluate.ts` 的 `evaluate`）。 */
  readonly evaluate: (ast: Expr, ctx: EvalContext) => Value
  /** 表达式 → 运行期引用矩形（`evaluate.ts` 绑好的 `runtimeRefFromExpr`）。 */
  readonly resolveRef: (expr: Expr, ctx?: EvalContext) => RuntimeRefResult
  /** 把一个矩形读成值（`evaluate.ts` 的 `evaluateRuntimeRef`）。 */
  readonly evaluateRuntimeRef: (
    ref: RuntimeRef,
    ctx: EvalContext,
    scalarTopLeft?: boolean,
  ) => Value
}

export function evaluateSheet(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: RefInfoDeps,
): Value {
  if (args.length > 1) return ERR('#VALUE!', 'SHEET expects 0 or 1 arguments')
  if (args.length === 0) return currentSheetNumber(ctx)
  const arg = args[0]
  if (arg.kind === 'ref' || arg.kind === 'range') return currentSheetNumber(ctx)
  if (arg.kind === 'crossSheet') {
    const idx = ctx.sheetIndexOf?.(arg.sheetName)
    return idx === undefined ? ERR('#REF!') : { kind: 'number', value: idx + 1 }
  }
  if (arg.kind === 'multiArea') {
    if (arg.areas.length === 0) return ERR('#VALUE!')
    const error = validateReferenceExpr(arg, ctx, deps)
    if (error) return error
    return evaluateSheet([arg.areas[0]], ctx, deps)
  }
  return ERR('#VALUE!')
}

function currentSheetNumber(ctx: EvalContext): Value {
  return ctx.currentSheetIndex === undefined
    ? ERR('#REF!')
    : { kind: 'number', value: ctx.currentSheetIndex + 1 }
}

export function evaluateSheets(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: RefInfoDeps,
): Value {
  if (args.length > 1) return ERR('#VALUE!', 'SHEETS expects 0 or 1 arguments')
  if (args.length === 0) return { kind: 'number', value: ctx.sheetCount ?? 1 }
  const arg = args[0]
  if (arg.kind === 'ref' || arg.kind === 'range') {
    return { kind: 'number', value: 1 }
  }
  if (arg.kind === 'crossSheet') {
    const error = validateReferenceExpr(arg, ctx, deps)
    return error ?? { kind: 'number', value: 1 }
  }
  return ERR('#VALUE!')
}

export function evaluateAreas(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: RefInfoDeps,
): Value {
  if (args.length !== 1) return ERR('#VALUE!', 'AREAS expects 1 argument')
  const arg = args[0]
  if (arg.kind === 'multiArea') {
    const error = validateReferenceExpr(arg, ctx, deps)
    if (error) return error
    return { kind: 'number', value: arg.areas.length }
  }
  const resolved = deps.resolveRef(arg, ctx)
  if (!resolved.ok) return resolved.error ?? ERR('#VALUE!')
  return validateRuntimeRefSheet(resolved.ref, ctx) ?? { kind: 'number', value: 1 }
}

export function evaluateIsFormula(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: RefInfoDeps,
): Value {
  if (args.length !== 1) return ERR('#VALUE!')
  const resolved = deps.resolveRef(args[0], ctx)
  if (!resolved.ok) return { kind: 'boolean', value: false }
  const target = cellForRuntimeRef(topLeftRuntimeRef(resolved.ref), ctx)
  if (target.error) return { kind: 'boolean', value: false }
  return { kind: 'boolean', value: target.cell?.ast !== undefined }
}

export function evaluateIsRef(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: RefInfoDeps,
): Value {
  if (args.length !== 1) return ERR('#VALUE!')
  if (args[0].kind === 'multiArea') {
    return { kind: 'boolean', value: validateReferenceExpr(args[0], ctx, deps) === undefined }
  }
  const resolved = deps.resolveRef(args[0], ctx)
  if (!resolved.ok) return { kind: 'boolean', value: false }
  const sheetError = validateRuntimeRefSheet(resolved.ref, ctx)
  return { kind: 'boolean', value: sheetError === undefined }
}

function validateReferenceExpr(expr: Expr, ctx: EvalContext, deps: RefInfoDeps): Value | undefined {
  if (expr.kind === 'multiArea') {
    for (const area of expr.areas) {
      const error = validateReferenceExpr(area, ctx, deps)
      if (error) return error
    }
    return undefined
  }
  const resolved = deps.resolveRef(expr, ctx)
  if (!resolved.ok) return resolved.error ?? ERR('#VALUE!')
  return validateRuntimeRefSheet(resolved.ref, ctx)
}

export function evaluateRow(args: ReadonlyArray<Expr>, ctx: EvalContext, deps: RefInfoDeps): Value {
  if (args.length === 0) {
    return { kind: 'number', value: (ctx.currentCell?.row ?? 0) + 1 }
  }
  if (args.length !== 1) return ERR('#VALUE!', 'ROW expects 0 or 1 arguments')
  const resolved = deps.resolveRef(args[0], ctx)
  if (resolved.ok) return verticalSequence(resolved.ref.range.rowStart, resolved.ref.range.rowEnd)
  if (resolved.error) return resolved.error
  const value = deps.evaluate(args[0], ctx)
  if (value.kind === 'error') return value
  if (value.kind === 'array') return verticalSequence(0, value.value.length - 1)
  return { kind: 'number', value: 1 }
}

export function evaluateColumn(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: RefInfoDeps,
): Value {
  if (args.length === 0) {
    return { kind: 'number', value: (ctx.currentCell?.col ?? 0) + 1 }
  }
  if (args.length !== 1) return ERR('#VALUE!', 'COLUMN expects 0 or 1 arguments')
  const resolved = deps.resolveRef(args[0], ctx)
  if (resolved.ok) return horizontalSequence(resolved.ref.range.colStart, resolved.ref.range.colEnd)
  if (resolved.error) return resolved.error
  const value = deps.evaluate(args[0], ctx)
  if (value.kind === 'error') return value
  if (value.kind === 'array') return horizontalSequence(0, (value.value[0]?.length ?? 1) - 1)
  return { kind: 'number', value: 1 }
}

export function evaluateRows(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: RefInfoDeps,
): Value {
  if (args.length !== 1) return ERR('#VALUE!', 'ROWS expects 1 argument')
  const resolved = deps.resolveRef(args[0], ctx)
  if (resolved.ok) {
    return { kind: 'number', value: resolved.ref.range.rowEnd - resolved.ref.range.rowStart + 1 }
  }
  if (resolved.error) return resolved.error
  const value = deps.evaluate(args[0], ctx)
  if (value.kind === 'error') return value
  if (value.kind === 'array') return { kind: 'number', value: value.value.length }
  return { kind: 'number', value: 1 }
}

export function evaluateColumns(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: RefInfoDeps,
): Value {
  if (args.length !== 1) return ERR('#VALUE!', 'COLUMNS expects 1 argument')
  const resolved = deps.resolveRef(args[0], ctx)
  if (resolved.ok) {
    return { kind: 'number', value: resolved.ref.range.colEnd - resolved.ref.range.colStart + 1 }
  }
  if (resolved.error) return resolved.error
  const value = deps.evaluate(args[0], ctx)
  if (value.kind === 'error') return value
  if (value.kind === 'array') return { kind: 'number', value: value.value[0]?.length ?? 0 }
  return { kind: 'number', value: 1 }
}

function verticalSequence(start: number, end: number): Value {
  if (start === end) return { kind: 'number', value: start + 1 }
  const rows: Value[][] = []
  for (let row = start; row <= end; row += 1) {
    rows.push([{ kind: 'number', value: row + 1 }])
  }
  return arrayResult(rows, 'ROW result')
}

function horizontalSequence(start: number, end: number): Value {
  if (start === end) return { kind: 'number', value: start + 1 }
  const row: Value[] = []
  for (let col = start; col <= end; col += 1) {
    row.push({ kind: 'number', value: col + 1 })
  }
  return arrayResult([row], 'COLUMN result')
}

export function evaluateFormulaText(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: RefInfoDeps,
): Value {
  if (args.length !== 1) return ERR('#VALUE!', 'FORMULATEXT expects 1 argument')
  const resolved = deps.resolveRef(args[0], ctx)
  if (!resolved.ok) return resolved.error ?? ERR('#VALUE!')
  const cell = cellForRuntimeRef(resolved.ref, ctx)
  if (cell.error) return cell.error
  if (!cell.cell?.ast) return ERR('#N/A')
  return { kind: 'string', value: cell.cell.input }
}
