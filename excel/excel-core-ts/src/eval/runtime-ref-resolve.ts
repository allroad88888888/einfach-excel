/**
 * 表达式 → 运行期引用矩形。
 *
 * 职责：把一个 `Expr` 解析成它指向的引用矩形 `RuntimeRef` —— 单格、区域、动态
 * 区域、`A1#`、跨表、定义名，外加三个「返回引用」的函数（`INDIRECT` /
 * `OFFSET` / `INDEX`）的实参。解析好之后能拿这个矩形做什么，是另一件事，住在
 * `runtime-ref.ts`。
 *
 * 求值器是**参数**（`RefResolveDeps`）传进来的，不是 import 的：上面几条分支要
 * 先把实参算成值才知道矩形落在哪，反向 import `evaluate.ts` 就成环了。
 *
 * 超过 300 行是刻意的：这是一个分派（`runtimeRefFromExpr`）连着它的几条臂，
 * 而每条臂又要回头调分派本身去解析锚点。把 `INDEX` / `OFFSET` 搬走，读者得跨
 * 文件追同一个 switch 的分支，两边还要互相注入 —— 拆了更难读。
 */
import type { CellCoord, EvalContext, Expr, Value } from '../types'
import { EXCEL_MAX_COL, EXCEL_MAX_ROW, normalizeRange, parseA1, parseRange } from '../refs'
import { toBoolean, toNumber, toString as toStr } from './coerce'
import { canonicalName } from './canonical-name'
import { ERR } from './error-value'
import { parseIndirectReference } from './indirect-text'
import { sliceMaterialized, type RuntimeRef } from './runtime-ref'

/**
 * 本模块向求值器索取的两个回调。
 *
 * 传参而不是 import，是为了不让本文件与 `evaluate.ts` 成环 —— 参照
 * `spill-collision.ts` / `spill-projection.ts` 的形状。
 */
export interface RefResolveDeps {
  /** 单格 AST 的递归求值器（`evaluate.ts` 的 `evaluate`）。 */
  readonly evaluate: (ast: Expr, ctx: EvalContext) => Value
  /** `A1#` 专用的**不折叠**单格读；只有 `spillAnchorValue` 用得到。 */
  readonly rawValueAt: (
    sheetName: string | undefined,
    coord: CellCoord,
    ctx: EvalContext,
  ) => Value
}

/** 解析结果：拿到矩形，或者没拿到（可能带一个要往上抛的错误值）。 */
export type RuntimeRefResult =
  | { readonly ok: true; readonly ref: RuntimeRef }
  | { readonly ok: false; readonly error?: Value }

export type IntegerArgResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly error: Value }

export type SelectedExprResult =
  | { readonly ok: true; readonly expr: Expr }
  | { readonly ok: false; readonly error: Value }

export function runtimeRefFromExpr(
  expr: Expr,
  // 原来是可选形参；`deps` 是必填，只能改成显式的 `| undefined`。调用侧照旧可以
  // 传 `undefined`（没有 ctx 时只解析得动 `ref` / `range` 这两种字面引用）。
  ctx: EvalContext | undefined,
  deps: RefResolveDeps,
): { readonly ok: true; readonly ref: RuntimeRef } | {
  readonly ok: false
  readonly error?: Value
} {
  switch (expr.kind) {
    case 'ref': {
      const parsed = parseA1(expr.a1)
      if (!parsed) return { ok: false, error: ERR('#REF!') }
      return {
        ok: true,
        ref: {
          range: {
            rowStart: parsed.row,
            rowEnd: parsed.row,
            colStart: parsed.col,
            colEnd: parsed.col,
          },
        },
      }
    }
    case 'range': {
      const range = parseRange(expr.start, expr.end)
      if (!range) return { ok: false, error: ERR('#REF!') }
      return { ok: true, ref: { range } }
    }
    case 'dynamicRange': {
      if (!ctx) return { ok: false }
      return runtimeRefFromDynamicRange(expr, ctx, deps)
    }
    case 'spillRef': {
      if (!ctx) return { ok: false }
      return runtimeRefFromSpillRef(expr, ctx, deps)
    }
    case 'crossSheet': {
      const inner = runtimeRefFromExpr(expr.inner, ctx, deps)
      if (!inner.ok) return inner
      return {
        ok: true,
        ref: {
          sheetName: expr.sheetName,
          range: inner.ref.range,
        },
      }
    }
    case 'name': {
      if (!ctx) return { ok: false }
      const name = canonicalName(expr.name)
      if (ctx.lambdaScope?.get(name) !== undefined) return { ok: false }
      const scopedRef = ctx.lambdaRefScope?.get(name)
      if (scopedRef) return { ok: true, ref: scopedRef }
      const binding = ctx.resolveName(expr.name)
      if (binding?.kind !== 'range') return { ok: false }
      const range = parseRange(binding.start, binding.end)
      if (!range) return { ok: false, error: ERR('#REF!') }
      return { ok: true, ref: { sheetName: binding.sheetName, range } }
    }
    case 'call': {
      if (!ctx) return { ok: false }
      const upper = expr.name.toUpperCase()
      if (upper === 'OFFSET') return runtimeRefFromOffsetArgs(expr.args, ctx, deps)
      if (upper === 'INDIRECT') return runtimeRefFromIndirectArgs(expr.args, ctx, deps)
      if (upper === 'INDEX') return runtimeRefFromIndexArgs(expr.args, ctx, deps)
      if (upper === 'CHOOSE') {
        const selected = chooseSelectedExpr(expr.args, ctx, deps)
        if (!selected.ok) return { ok: false, error: selected.error }
        return runtimeRefFromExpr(selected.expr, ctx, deps)
      }
      return { ok: false }
    }
    default:
      return { ok: false }
  }
}

function runtimeRefFromDynamicRange(
  expr: Extract<Expr, { readonly kind: 'dynamicRange' }>,
  ctx: EvalContext,
  deps: RefResolveDeps,
): { readonly ok: true; readonly ref: RuntimeRef } | {
  readonly ok: false
  readonly error?: Value
} {
  const start = runtimeRefFromExpr(expr.start, ctx, deps)
  if (!start.ok) return start.error ? { ok: false, error: start.error } : { ok: false }
  const end = runtimeRefFromExpr(expr.end, ctx, deps)
  if (!end.ok) return end.error ? { ok: false, error: end.error } : { ok: false, error: ERR('#VALUE!') }

  const sheet = combinedRuntimeRefSheet(start.ref, end.ref, ctx)
  if (!sheet.ok) return { ok: false, error: sheet.error }

  return {
    ok: true,
    ref: {
      sheetName: sheet.sheetName,
      range: normalizeRange({
        rowStart: start.ref.range.rowStart,
        rowEnd: end.ref.range.rowEnd,
        colStart: start.ref.range.colStart,
        colEnd: end.ref.range.colEnd,
      }),
    },
  }
}

function combinedRuntimeRefSheet(
  start: RuntimeRef,
  end: RuntimeRef,
  ctx: EvalContext,
): { readonly ok: true; readonly sheetName?: string }
  | { readonly ok: false; readonly error: Value } {
  const lhs = start.sheetName ?? ctx.currentSheetName
  const rhs = end.sheetName ?? ctx.currentSheetName
  if (lhs !== undefined && rhs !== undefined && lhs !== rhs) {
    return { ok: false, error: ERR('#VALUE!', 'range endpoints must be on the same sheet') }
  }
  return { ok: true, sheetName: start.sheetName ?? end.sheetName }
}

export function runtimeRefFromSpillRef(
  expr: Extract<Expr, { readonly kind: 'spillRef' }>,
  ctx: EvalContext,
  deps: RefResolveDeps,
): { readonly ok: true; readonly ref: RuntimeRef } | {
  readonly ok: false
  readonly error?: Value
} {
  const anchor = runtimeRefFromExpr(expr.anchor, ctx, deps)
  if (!anchor.ok) return anchor.error ? { ok: false, error: anchor.error } : { ok: false }
  const value = spillAnchorValue(expr, ctx, deps)
  if (value.kind === 'error') return { ok: false, error: value }
  if (value.kind !== 'array') {
    return { ok: false, error: ERR('#REF!', 'spill reference anchor is not an array') }
  }
  const rows = value.value.length
  const cols = value.value[0]?.length ?? 0
  if (rows < 1 || cols < 1) return { ok: false, error: ERR('#REF!') }
  const rowEnd = anchor.ref.range.rowStart + rows - 1
  const colEnd = anchor.ref.range.colStart + cols - 1
  if (rowEnd > EXCEL_MAX_ROW || colEnd > EXCEL_MAX_COL) return { ok: false, error: ERR('#REF!') }
  return {
    ok: true,
    ref: {
      sheetName: anchor.ref.sheetName,
      range: {
        rowStart: anchor.ref.range.rowStart,
        rowEnd,
        colStart: anchor.ref.range.colStart,
        colEnd,
      },
      materialized: value.value,
    },
  }
}

function spillAnchorValue(
  expr: Extract<Expr, { readonly kind: 'spillRef' }>,
  ctx: EvalContext,
  deps: RefResolveDeps,
): Value {
  const anchor = runtimeRefFromExpr(expr.anchor, ctx, deps)
  if (!anchor.ok) return anchor.error ?? ERR('#REF!')
  const range = anchor.ref.range
  if (range.rowStart !== range.rowEnd || range.colStart !== range.colEnd) return ERR('#REF!')
  return deps.rawValueAt(
    anchor.ref.sheetName,
    { row: range.rowStart, col: range.colStart },
    ctx,
  )
}

export function runtimeRefFromIndirectArgs(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: RefResolveDeps,
): { readonly ok: true; readonly ref: RuntimeRef } | {
  readonly ok: false
  readonly error?: Value
} {
  if (args.length < 1 || args.length > 2) {
    return { ok: false, error: ERR('#VALUE!', 'INDIRECT expects 1 or 2 arguments') }
  }
  const textValue = deps.evaluate(args[0], ctx)
  if (textValue.kind === 'error') return { ok: false, error: textValue }
  const text = toStr(textValue)
  if (!text.ok) return { ok: false, error: text.error }

  let a1Style = true
  if (args.length === 2) {
    const styleValue = deps.evaluate(args[1], ctx)
    if (styleValue.kind === 'error') return { ok: false, error: styleValue }
    const style = toBoolean(styleValue)
    if (!style.ok) return { ok: false, error: style.error }
    a1Style = style.value
  }

  const ref = parseIndirectReference(text.value, a1Style, ctx.currentCell)
  return ref ? { ok: true, ref } : { ok: false, error: ERR('#REF!') }
}

export function runtimeRefFromOffsetArgs(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: RefResolveDeps,
): { readonly ok: true; readonly ref: RuntimeRef } | {
  readonly ok: false
  readonly error?: Value
} {
  if (args.length < 3 || args.length > 5) {
    return { ok: false, error: ERR('#VALUE!', 'OFFSET expects 3 to 5 arguments') }
  }
  const anchor = runtimeRefFromExpr(args[0], ctx, deps)
  if (!anchor.ok) return { ok: false, error: anchor.error ?? ERR('#VALUE!') }

  const rowOffset = evaluateIntegerArg(args[1], ctx, deps)
  if (!rowOffset.ok) return { ok: false, error: rowOffset.error }
  const colOffset = evaluateIntegerArg(args[2], ctx, deps)
  if (!colOffset.ok) return { ok: false, error: colOffset.error }

  const anchorRows = anchor.ref.range.rowEnd - anchor.ref.range.rowStart + 1
  const anchorCols = anchor.ref.range.colEnd - anchor.ref.range.colStart + 1
  const height: IntegerArgResult = args.length >= 4
    ? evaluatePositiveIntegerArg(args[3], ctx, deps)
    : { ok: true, value: anchorRows }
  if (!height.ok) return { ok: false, error: height.error }
  const width: IntegerArgResult = args.length === 5
    ? evaluatePositiveIntegerArg(args[4], ctx, deps)
    : { ok: true, value: anchorCols }
  if (!width.ok) return { ok: false, error: width.error }

  const rowStart = anchor.ref.range.rowStart + rowOffset.value
  const colStart = anchor.ref.range.colStart + colOffset.value
  const rowEnd = rowStart + height.value - 1
  const colEnd = colStart + width.value - 1
  if (
    rowStart < 0 ||
    colStart < 0 ||
    rowEnd > EXCEL_MAX_ROW ||
    colEnd > EXCEL_MAX_COL
  ) {
    return { ok: false, error: ERR('#REF!') }
  }
  return {
    ok: true,
    ref: {
      sheetName: anchor.ref.sheetName,
      range: { rowStart, rowEnd, colStart, colEnd },
    },
  }
}

export function runtimeRefFromIndexArgs(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: RefResolveDeps,
): { readonly ok: true; readonly ref: RuntimeRef } | {
  readonly ok: false
  readonly error?: Value
} {
  if (args.length < 2 || args.length > 4) {
    return { ok: false, error: ERR('#VALUE!', 'INDEX expects 2 to 4 arguments') }
  }
  const source = runtimeRefFromIndexSource(args, ctx, deps)
  if (!source.ok) return source.error ? { ok: false, error: source.error } : { ok: false }

  const row = evaluateIntegerArg(args[1], ctx, deps)
  if (!row.ok) return { ok: false, error: row.error }
  const colExplicit = args.length >= 3
  const col: IntegerArgResult = colExplicit
    ? evaluateIntegerArg(args[2], ctx, deps)
    : { ok: true, value: 0 }
  if (!col.ok) return { ok: false, error: col.error }
  if (row.value < 0 || col.value < 0) return { ok: false, error: ERR('#VALUE!') }

  const range = source.ref.range
  const height = range.rowEnd - range.rowStart + 1
  const width = range.colEnd - range.colStart + 1

  const refAt = (
    rowStartOffset: number,
    rowEndOffset: number,
    colStartOffset: number,
    colEndOffset: number,
  ): { readonly ok: true; readonly ref: RuntimeRef } => {
    const materialized = source.ref.materialized
      ? sliceMaterialized(
          source.ref.materialized,
          rowStartOffset,
          rowEndOffset,
          colStartOffset,
          colEndOffset,
        )
      : undefined
    return {
      ok: true,
      ref: {
        sheetName: source.ref.sheetName,
        range: {
          rowStart: range.rowStart + rowStartOffset,
          rowEnd: range.rowStart + rowEndOffset,
          colStart: range.colStart + colStartOffset,
          colEnd: range.colStart + colEndOffset,
        },
        ...(materialized ? { materialized } : {}),
      },
    }
  }

  if (!colExplicit) {
    if (height === 1 && width > 1) {
      if (row.value === 0) return refAt(0, 0, 0, width - 1)
      if (row.value < 1 || row.value > width) return { ok: false, error: ERR('#REF!') }
      const colOffset = row.value - 1
      return refAt(0, 0, colOffset, colOffset)
    }
    if (width === 1 && height > 1) {
      if (row.value === 0) return refAt(0, height - 1, 0, 0)
      if (row.value < 1 || row.value > height) return { ok: false, error: ERR('#REF!') }
      const rowOffset = row.value - 1
      return refAt(rowOffset, rowOffset, 0, 0)
    }
    if (height === 1 && width === 1) {
      if (row.value === 0 || row.value === 1) return refAt(0, 0, 0, 0)
      return { ok: false, error: ERR('#REF!') }
    }
  }

  if (row.value > height || col.value > width) return { ok: false, error: ERR('#REF!') }

  if (row.value === 0 && col.value === 0) return refAt(0, height - 1, 0, width - 1)
  if (row.value === 0) {
    const colOffset = col.value - 1
    return refAt(0, height - 1, colOffset, colOffset)
  }
  if (col.value === 0) {
    const rowOffset = row.value - 1
    return refAt(rowOffset, rowOffset, 0, width - 1)
  }
  return refAt(row.value - 1, row.value - 1, col.value - 1, col.value - 1)
}

function runtimeRefFromIndexSource(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: RefResolveDeps,
): { readonly ok: true; readonly ref: RuntimeRef } | {
  readonly ok: false
  readonly error?: Value
} {
  const sourceExpr = args[0]
  if (sourceExpr.kind === 'multiArea') {
    const area = evaluateIndexAreaArg(args[3], ctx, sourceExpr.areas.length, deps)
    if (!area.ok) return { ok: false, error: area.error }
    return runtimeRefFromExpr(sourceExpr.areas[area.value - 1], ctx, deps)
  }

  const source = runtimeRefFromExpr(sourceExpr, ctx, deps)
  if (!source.ok) return source
  if (args.length < 4) return source

  const area = evaluateIndexAreaArg(args[3], ctx, 1, deps)
  if (!area.ok) return { ok: false, error: area.error }
  return source
}

function evaluateIndexAreaArg(
  expr: Expr | undefined,
  ctx: EvalContext,
  areaCount: number,
  deps: RefResolveDeps,
): IntegerArgResult {
  if (expr === undefined) return { ok: true, value: 1 }
  const area = evaluateIntegerArg(expr, ctx, deps)
  if (!area.ok) return area
  if (area.value < 1) return { ok: false, error: ERR('#VALUE!') }
  if (area.value > areaCount) return { ok: false, error: ERR('#REF!') }
  return area
}

function evaluateIntegerArg(
  expr: Expr,
  ctx: EvalContext,
  deps: RefResolveDeps,
): IntegerArgResult {
  const value = deps.evaluate(expr, ctx)
  if (value.kind === 'error') return { ok: false, error: value }
  const n = toNumber(value)
  if (!n.ok) return { ok: false, error: n.error }
  const integer = Math.trunc(n.value)
  if (!Number.isFinite(integer)) return { ok: false, error: ERR('#REF!') }
  return { ok: true, value: integer }
}

function evaluatePositiveIntegerArg(
  expr: Expr,
  ctx: EvalContext,
  deps: RefResolveDeps,
): IntegerArgResult {
  const value = evaluateIntegerArg(expr, ctx, deps)
  if (!value.ok) return value
  if (value.value < 1) return { ok: false, error: ERR('#REF!') }
  return value
}

export function chooseSelectedExpr(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: RefResolveDeps,
): SelectedExprResult {
  if (args.length < 2) return { ok: false, error: ERR('#VALUE!') }
  const indexValue = deps.evaluate(args[0], ctx)
  if (indexValue.kind === 'error') return { ok: false, error: indexValue }
  const indexNumber = toNumber(indexValue)
  if (!indexNumber.ok) return { ok: false, error: indexNumber.error }
  const index = Math.trunc(indexNumber.value)
  if (index < 1 || index > args.length - 1) return { ok: false, error: ERR('#VALUE!') }
  return { ok: true, expr: args[index] }
}
