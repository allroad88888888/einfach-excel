/**
 * 条件选择类函数在**数组**判定参数上的求值。
 *
 * 职责：当 `IF` / `IFERROR` / `IFNA` / `IFS` / `SWITCH` / `CHOOSE` 的判定参数是
 * 一片数组时，逐格算出这一格该走哪一路分支，再把被选中的那几路广播回同一形状。
 *
 * 标量路径（短路、只算选中的那一支）留在 `evaluate.ts` —— 那是 `evaluate` 自己
 * 的懒求值约定。「实参怎么求值」是**参数**传进来的，不是 import 的：反向 import
 * `evaluate.ts` 会成环。
 *
 * 超过 300 行是刻意的：六个函数走的是同一套算法 —— 逐格定选路、只物化被选中的
 * 那几路、按广播规则取格 —— 共用同一张 `ArraySelection` 选路矩阵。按函数名拆，
 * 这张矩阵的协议就要在两个文件之间来回对，读者更难确认「某一格为什么取到这个
 * 值」。
 */
import type { EvalContext, Expr, Value } from '../types'
import { toBoolean, toNumber } from './coerce'
import { excelEquals } from './functions/logical'
import { ERR } from './error-value'
import { arrayResult } from './array-shape'
import {
  makeMatrix,
  pickBroadcastCell,
  valueBroadcastGrid,
  valueToGrid,
  type Grid,
} from './grid'

/**
 * 求值器的「实参求值」（`evaluate.ts` 的 `evaluateFunctionArg`）。
 *
 * 传参而不是 import，是为了不与求值器成环 —— 参照 `spill-collision.ts` 的形状。
 */
export type EvaluateFunctionArg = (expr: Expr, ctx: EvalContext) => Value

export function evaluateArrayIf(
  cond: Value,
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  evaluateFunctionArg: EvaluateFunctionArg,
): Value {
  const condGrid = valueToGrid(cond)
  if (condGrid.error) return condGrid.error
  const rows = condGrid.grid.rows
  const cols = condGrid.grid.cols
  const conds: Array<Array<
    | { readonly kind: 'then' }
    | { readonly kind: 'else' }
    | { readonly kind: 'error'; readonly error: Value }
  >> = new Array(rows)
  let needsThen = false
  let needsElse = false

  for (let r = 0; r < rows; r += 1) {
    conds[r] = new Array(cols)
    for (let c = 0; c < cols; c += 1) {
      const coerced = toBoolean(condGrid.grid.cells[r][c])
      if (!coerced.ok) {
        conds[r][c] = { kind: 'error', error: coerced.error }
      } else if (coerced.value) {
        conds[r][c] = { kind: 'then' }
        needsThen = true
      } else {
        conds[r][c] = { kind: 'else' }
        needsElse = true
      }
    }
  }

  const thenGrid = needsThen
    ? evaluateBroadcastGrid(args[1], ctx, rows, cols, evaluateFunctionArg)
    : undefined
  if (thenGrid?.error) return thenGrid.error
  const elseGrid = needsElse
    ? args.length === 3
      ? evaluateBroadcastGrid(args[2], ctx, rows, cols, evaluateFunctionArg)
      : valueBroadcastGrid({ kind: 'boolean', value: false }, rows, cols)
    : undefined
  if (elseGrid?.error) return elseGrid.error

  const out = makeMatrix(rows, cols)
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const selected = conds[r][c]
      switch (selected.kind) {
        case 'error':
          out[r][c] = selected.error
          break
        case 'then':
          out[r][c] = pickBroadcastCell(thenGrid!.grid, r, c)
          break
        case 'else':
          out[r][c] = pickBroadcastCell(elseGrid!.grid, r, c)
          break
      }
    }
  }
  return arrayResult(out, 'IF result')
}

export function evaluateArrayIfError(
  value: Value,
  fallback: Expr,
  ctx: EvalContext,
  catches: (error: Value & { kind: 'error' }) => boolean,
  evaluateFunctionArg: EvaluateFunctionArg,
): Value {
  const valueGrid = valueToGrid(value)
  if (valueGrid.error) return valueGrid.error
  const rows = valueGrid.grid.rows
  const cols = valueGrid.grid.cols
  let needsFallback = false
  for (const row of valueGrid.grid.cells) {
    for (const cell of row) {
      if (cell.kind === 'error' && catches(cell)) needsFallback = true
    }
  }
  if (!needsFallback) return value

  const fallbackGrid = evaluateBroadcastGrid(fallback, ctx, rows, cols, evaluateFunctionArg)
  if (fallbackGrid.error) return fallbackGrid.error
  const out = makeMatrix(rows, cols)
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cell = valueGrid.grid.cells[r][c]
      out[r][c] = cell.kind === 'error' && catches(cell)
        ? pickBroadcastCell(fallbackGrid.grid, r, c)
        : cell
    }
  }
  return arrayResult(out, 'IFERROR result')
}

export function evaluateArrayChoose(
  indexValue: Value,
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  evaluateFunctionArg: EvaluateFunctionArg,
): Value {
  const indexGrid = valueToGrid(indexValue)
  if (indexGrid.error) return indexGrid.error
  const rows = indexGrid.grid.rows
  const cols = indexGrid.grid.cols
  const choices = new Map<number, { readonly grid?: Grid; readonly error?: Value }>()
  const out = makeMatrix(rows, cols)

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const indexCell = indexGrid.grid.cells[r][c]
      if (indexCell.kind === 'error') {
        out[r][c] = indexCell
        continue
      }
      const indexNumber = toNumber(indexCell)
      if (!indexNumber.ok) {
        out[r][c] = indexNumber.error
        continue
      }
      const index = Math.trunc(indexNumber.value)
      if (index < 1 || index > args.length - 1) {
        out[r][c] = ERR('#VALUE!')
        continue
      }

      let choice = choices.get(index)
      if (!choice) {
        const broadcast = evaluateBroadcastGrid(args[index], ctx, rows, cols, evaluateFunctionArg)
        choice = broadcast.error ? { error: broadcast.error } : { grid: broadcast.grid }
        choices.set(index, choice)
      }
      out[r][c] = choice.error ?? pickBroadcastCell(choice.grid!, r, c)
    }
  }
  return arrayResult(out, 'CHOOSE result')
}

export function evaluateArrayIfs(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  startPair: number,
  firstCond: Value,
  evaluateFunctionArg: EvaluateFunctionArg,
): Value {
  const firstGrid = valueToGrid(firstCond)
  if (firstGrid.error) return firstGrid.error
  const rows = firstGrid.grid.rows
  const cols = firstGrid.grid.cols
  const pairCount = Math.floor(args.length / 2)
  const selected = makeSelectionMatrix(rows, cols)
  const selectedPairs = new Set<number>()
  let pending = rows * cols

  for (let i = startPair; i < pairCount && pending > 0; i += 1) {
    const condValue = i === startPair ? firstCond : evaluateFunctionArg(args[i * 2], ctx)
    const condGrid = valueBroadcastGrid(condValue, rows, cols)
    if (condGrid.error) return condGrid.error

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (selected[r][c].kind !== 'pending') continue
        const coerced = toBoolean(pickBroadcastCell(condGrid.grid, r, c))
        if (!coerced.ok) {
          selected[r][c] = { kind: 'error', error: coerced.error }
          pending -= 1
        } else if (coerced.value) {
          selected[r][c] = { kind: 'value', index: i }
          selectedPairs.add(i)
          pending -= 1
        }
      }
    }
  }

  return materializeSelections(
    selected,
    selectedPairs,
    (index) => args[index * 2 + 1],
    ctx,
    evaluateFunctionArg,
  )
}

export function evaluateArraySwitch(
  exprValue: Value,
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  evaluateFunctionArg: EvaluateFunctionArg,
): Value {
  const exprGrid = valueToGrid(exprValue)
  if (exprGrid.error) return exprGrid.error
  const rows = exprGrid.grid.rows
  const cols = exprGrid.grid.cols
  const rest = args.length - 1
  const pairCount = Math.floor(rest / 2)
  const hasDefault = rest % 2 === 1
  const selected = makeSelectionMatrix(rows, cols)
  const selectedPairs = new Set<number>()
  let pending = rows * cols

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const exprCell = exprGrid.grid.cells[r][c]
      if (exprCell.kind === 'error') {
        selected[r][c] = { kind: 'error', error: exprCell }
        pending -= 1
      }
    }
  }

  for (let i = 0; i < pairCount && pending > 0; i += 1) {
    const caseValue = evaluateFunctionArg(args[1 + i * 2], ctx)
    const caseGrid = valueBroadcastGrid(caseValue, rows, cols)
    if (caseGrid.error) return caseGrid.error

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (selected[r][c].kind !== 'pending') continue
        const caseCell = pickBroadcastCell(caseGrid.grid, r, c)
        if (caseCell.kind === 'error') {
          selected[r][c] = { kind: 'error', error: caseCell }
          pending -= 1
        } else if (excelEquals(exprGrid.grid.cells[r][c], caseCell)) {
          selected[r][c] = { kind: 'value', index: i }
          selectedPairs.add(i)
          pending -= 1
        }
      }
    }
  }

  if (pending > 0) {
    const defaultIndex = hasDefault ? pairCount : -1
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (selected[r][c].kind !== 'pending') continue
        if (hasDefault) {
          selected[r][c] = { kind: 'value', index: defaultIndex }
          selectedPairs.add(defaultIndex)
        } else {
          selected[r][c] = { kind: 'error', error: ERR('#N/A') }
        }
      }
    }
  }

  return materializeSelections(
    selected,
    selectedPairs,
    (index) => (index === pairCount ? args[args.length - 1] : args[1 + index * 2 + 1]),
    ctx,
    evaluateFunctionArg,
  )
}

type ArraySelection =
  | { readonly kind: 'pending' }
  | { readonly kind: 'value'; readonly index: number }
  | { readonly kind: 'error'; readonly error: Value }

function makeSelectionMatrix(rows: number, cols: number): ArraySelection[][] {
  const selected: ArraySelection[][] = new Array(rows)
  for (let r = 0; r < rows; r += 1) {
    selected[r] = new Array(cols)
    for (let c = 0; c < cols; c += 1) selected[r][c] = { kind: 'pending' }
  }
  return selected
}

function materializeSelections(
  selected: ReadonlyArray<ReadonlyArray<ArraySelection>>,
  selectedPairs: ReadonlySet<number>,
  exprForIndex: (index: number) => Expr,
  ctx: EvalContext,
  evaluateFunctionArg: EvaluateFunctionArg,
): Value {
  const rows = selected.length
  const cols = selected[0]?.length ?? 0
  const grids = new Map<number, { readonly grid?: Grid; readonly error?: Value }>()

  for (const index of selectedPairs) {
    const broadcast = evaluateBroadcastGrid(
      exprForIndex(index),
      ctx,
      rows,
      cols,
      evaluateFunctionArg,
    )
    grids.set(index, broadcast.error ? { error: broadcast.error } : { grid: broadcast.grid })
  }

  const out = makeMatrix(rows, cols)
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const choice = selected[r][c]
      if (choice.kind === 'error') {
        out[r][c] = choice.error
      } else if (choice.kind === 'value') {
        const grid = grids.get(choice.index)!
        out[r][c] = grid.error ?? pickBroadcastCell(grid.grid!, r, c)
      } else {
        out[r][c] = ERR('#N/A')
      }
    }
  }
  return arrayResult(out, 'selector result')
}

function evaluateBroadcastGrid(
  expr: Expr,
  ctx: EvalContext,
  rows: number,
  cols: number,
  evaluateFunctionArg: EvaluateFunctionArg,
): { readonly grid: Grid; readonly error?: undefined } | { readonly error: Value } {
  return valueBroadcastGrid(evaluateFunctionArg(expr, ctx), rows, cols)
}
