/**
 * 二元运算符的求值。
 *
 * 职责：给定一个运算符与两个已经求好的 `Value`，算出结果值 —— 数组广播、错误
 * 传播、Excel 的比较语义都在这里收口。
 */
import type { BinaryOp, Value } from '../types'
import { propagateError, toNumber, toString as toStr } from './coerce'
import { finiteOrNum } from './overflow'
import { ERR } from './error-value'
import { arrayResult, arrayShapeError } from './array-shape'
import { broadcastExtent, makeMatrix, pickBroadcastCell, valueToGrid } from './grid'

/**
 * Apply a binary operator. Errors propagate (left-first per Excel).
 * Comparisons return `boolean` Value. Concat returns `string`. Numeric
 * ops return `number`.
 */
export function applyBinary(op: BinaryOp, left: Value, right: Value): Value {
  if (left.kind === 'array' || right.kind === 'array') {
    return applyBroadcastBinary(op, left, right)
  }
  return applyScalarBinary(op, left, right)
}

function applyBroadcastBinary(op: BinaryOp, left: Value, right: Value): Value {
  const leftGrid = valueToGrid(left)
  if (leftGrid.error) return leftGrid.error
  const rightGrid = valueToGrid(right)
  if (rightGrid.error) return rightGrid.error

  const rows = broadcastExtent(leftGrid.grid.rows, rightGrid.grid.rows)
  const cols = broadcastExtent(leftGrid.grid.cols, rightGrid.grid.cols)
  if (rows === undefined || cols === undefined) return ERR('#VALUE!')
  const shapeError = arrayShapeError(rows, cols, 'array result', 'array result exceeds cell cap')
  if (shapeError) return shapeError

  const out = makeMatrix(rows, cols)
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      out[r][c] = applyScalarBinary(
        op,
        pickBroadcastCell(leftGrid.grid, r, c),
        pickBroadcastCell(rightGrid.grid, r, c),
      )
    }
  }
  return arrayResult(out, 'array result')
}

function applyScalarBinary(op: BinaryOp, left: Value, right: Value): Value {
  const propagated = propagateError([left, right])
  if (propagated) return propagated

  if (op === '&') {
    const ls = toStr(left)
    if (!ls.ok) return ls.error
    const rs = toStr(right)
    if (!rs.ok) return rs.error
    return { kind: 'string', value: ls.value + rs.value }
  }

  // Comparison ops support mixed types: numbers compared with numbers,
  // strings with strings (lex order), booleans coerced to 0/1.
  if (op === '=' || op === '<>' || op === '<' || op === '<=' || op === '>' || op === '>=') {
    return compareValues(op, left, right)
  }

  // Arithmetic ops — coerce both sides to number.
  const ln = toNumber(left)
  if (!ln.ok) return ln.error
  const rn = toNumber(right)
  if (!rn.ok) return rn.error
  const l = ln.value
  const r = rn.value
  switch (op) {
    case '+':
      return finiteOrNum(l + r)
    case '-':
      return finiteOrNum(l - r)
    case '*':
      return finiteOrNum(l * r)
    case '/':
      if (r === 0) return ERR('#DIV/0!')
      return finiteOrNum(l / r)
    case '^': {
      const res = Math.pow(l, r)
      if (!Number.isFinite(res)) return ERR('#NUM!')
      return { kind: 'number', value: res }
    }
  }
}

/**
 * Excel comparison semantics:
 *  - `blank` compares as 0 (numeric) or "" (string) — we model it as
 *    coerce to the *other* side's type.
 *  - cross-type compares: number < string in Excel's collation order.
 *    For Wave B parity we only need the cases that real formulas hit:
 *    same-type compares + blank-vs-anything. Skip the exotic ordering.
 *  - boolean compares to number via coerce, to boolean directly.
 */
function compareValues(op: BinaryOp, l: Value, r: Value): Value {
  let cmp: number
  if (l.kind === 'blank' && r.kind === 'blank') {
    cmp = 0
  } else if (l.kind === 'string' && r.kind === 'string') {
    cmp = l.value < r.value ? -1 : l.value > r.value ? 1 : 0
  } else if (l.kind === 'boolean' && r.kind === 'boolean') {
    cmp = (l.value ? 1 : 0) - (r.value ? 1 : 0)
  } else {
    // Default: coerce both to number.
    const ln = toNumber(l)
    if (!ln.ok) return ln.error
    const rn = toNumber(r)
    if (!rn.ok) return rn.error
    cmp = ln.value < rn.value ? -1 : ln.value > rn.value ? 1 : 0
  }
  let result: boolean
  switch (op) {
    case '=':
      result = cmp === 0
      break
    case '<>':
      result = cmp !== 0
      break
    case '<':
      result = cmp < 0
      break
    case '<=':
      result = cmp <= 0
      break
    case '>':
      result = cmp > 0
      break
    case '>=':
      result = cmp >= 0
      break
    default:
      return ERR('#ERROR!')
  }
  return { kind: 'boolean', value: result }
}
