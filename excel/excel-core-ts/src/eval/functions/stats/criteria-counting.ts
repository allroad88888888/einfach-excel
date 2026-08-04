import type { FunctionImpl, Value } from '../../../types'
import { BLANK } from '../../../types'
import { toNumber } from '../../coerce'
import { matchesCriterion, parseCriterion, type ParsedCriterion } from '../../criteria-grammar'
import { flatten, type ValueShape, valueShape } from './values'

// ---------------------------------------------------------------------------

export const COUNTIF: FunctionImpl = (args, _ctx) => {
  if (args.length !== 2) {
    return { kind: 'error', code: '#VALUE!', message: 'COUNTIF() requires 2 arguments' }
  }
  const [range, criterion] = args
  // criteria 实参本身是错误 → 传播（分歧 B）；条件区里的错误**格**则不短路，
  // 按显示文本参与比较（分歧 A），由 `matchesCriterion` 判定。
  const parsed = parseCriterion(criterion)
  if ('error' in parsed) return parsed.error

  const cells = flatten(range)
  let count = 0
  for (const cell of cells) {
    if (matchesCriterion(cell, parsed)) count++
  }
  return { kind: 'number', value: count }
}

export const SUMIF: FunctionImpl = (args, _ctx) => {
  if (args.length < 2 || args.length > 3) {
    return { kind: 'error', code: '#VALUE!', message: 'SUMIF() takes 2 or 3 arguments' }
  }
  const [range, criterion, sumRange] = args
  const parsed = parseCriterion(criterion)
  if ('error' in parsed) return parsed.error
  // sum_range **实参本身**是错误 → 传播（`=SUMIF(A1:A3,">1",#REF!)`）。与
  // 「条件区里的错误**格**不短路」是两回事，后者由 `matchesCriterion` 分档。
  if (sumRange?.kind === 'error') return sumRange

  const checkCells = flatten(range)
  const sumCells = sumRange ? flatten(sumRange) : checkCells

  // 遍历长度由**条件区**定，值区不参与 —— Excel 的 sum_range 只贡献左上角。
  // 值区是引用时，求值器已按 `criteria-value-rect.ts` 的矩形把它重读成同形
  // （见 `eval/criteria-value-range.ts`）；这里剩下的是非引用实参（数组字面量
  // 等）的兜底：短了当空格补（贡献 0），不再 `min(len)` 截断条件区。
  //
  // ⚠️ 曾经这里是 `n = Math.min(checkCells.length, sumCells.length)`，于是
  // `SUMIF(A1:A3,">1",B1)` 给 0、`SUMIF(A1:A3,">1",B1:B2)` 给 200，而稀疏孪生
  // `evaluateSparseSumIf` 对同一组输入给 500。配对断言见
  // `test/criteria-value-range.test.ts`，改这里必须让那条测试仍然绿。
  let total = 0
  for (let i = 0; i < checkCells.length; i++) {
    const probe = checkCells[i]
    // 条件区的错误格按显示文本参与比较，不再被无条件跳过（分歧 A）。
    if (!matchesCriterion(probe, parsed)) continue
    const target = sumCells[i] ?? BLANK
    if (target.kind === 'error') return target // propagate sum-side errors
    const num = toNumber(target)
    // Non-numeric sum-targets are silently ignored (Excel-compat); a string
    // that *looks* numeric does coerce, blanks coerce to 0.
    if (num.ok) total += num.value
  }
  return { kind: 'number', value: total }
}

export const COUNTIFS: FunctionImpl = (args, _ctx) => {
  if (args.length < 2 || args.length % 2 !== 0) {
    return { kind: 'error', code: '#VALUE!', message: 'COUNTIFS() requires range/criterion pairs' }
  }
  const pairs = collectPairs(args)
  if ('error' in pairs) return pairs.error
  if (pairs.flats.length === 0) return { kind: 'number', value: 0 }

  const len = pairs.flats[0].length
  const baseShape = pairs.shapes[0]
  for (const shape of pairs.shapes) {
    if (shape.rows !== baseShape.rows || shape.cols !== baseShape.cols) {
      return { kind: 'error', code: '#VALUE!', message: 'COUNTIFS ranges must share shape' }
    }
  }

  let count = 0
  outer: for (let i = 0; i < len; i++) {
    for (let j = 0; j < pairs.flats.length; j++) {
      const cell = pairs.flats[j][i]
      // 条件区里的错误格不短路：按显示文本参与比较，命不命中交给
      // `matchesCriterion`（与正上方 COUNTIF / SUMIF 同一口径 —— Excel 只有
      // 一套 criteria 语义）。值区那一档照常传播。
      if (!matchesCriterion(cell, pairs.parsed[j])) continue outer
    }
    count++
  }
  return { kind: 'number', value: count }
}

export const SUMIFS: FunctionImpl = (args, _ctx) => {
  // SUMIFS(sum_range, range1, crit1, range2, crit2, ...)
  if (args.length < 3 || args.length % 2 === 0) {
    return { kind: 'error', code: '#VALUE!', message: 'SUMIFS() requires sum_range + range/criterion pairs' }
  }
  const sumCells = flatten(args[0])
  const pairs = collectPairs(args.slice(1))
  if ('error' in pairs) return pairs.error
  if (pairs.flats.length === 0) {
    return { kind: 'error', code: '#VALUE!', message: 'SUMIFS() requires at least one criterion' }
  }

  const len = sumCells.length
  const sumShape = valueShape(args[0])
  for (const shape of pairs.shapes) {
    if (shape.rows !== sumShape.rows || shape.cols !== sumShape.cols) {
      return { kind: 'error', code: '#VALUE!', message: 'SUMIFS ranges must share shape' }
    }
  }

  let total = 0
  outer: for (let i = 0; i < len; i++) {
    for (let j = 0; j < pairs.flats.length; j++) {
      const cell = pairs.flats[j][i]
      // 条件区里的错误格不短路：按显示文本参与比较，命不命中交给
      // `matchesCriterion`（与正上方 COUNTIF / SUMIF 同一口径 —— Excel 只有
      // 一套 criteria 语义）。值区那一档照常传播。
      if (!matchesCriterion(cell, pairs.parsed[j])) continue outer
    }
    const target = sumCells[i]
    if (target.kind === 'error') return target
    const num = toNumber(target)
    if (num.ok) total += num.value
  }
  return { kind: 'number', value: total }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function collectPairs(
  args: Value[],
): { flats: Value[][]; parsed: ParsedCriterion[]; shapes: ValueShape[] } | { error: Value } {
  const flats: Value[][] = []
  const parsed: ParsedCriterion[] = []
  const shapes: ValueShape[] = []
  for (let i = 0; i < args.length; i += 2) {
    const rangeArg = args[i]
    const critArg = args[i + 1]
    const p = parseCriterion(critArg)
    if ('error' in p) return { error: p.error }
    flats.push(flatten(rangeArg))
    parsed.push(p)
    shapes.push(valueShape(rangeArg))
  }
  return { flats, parsed, shapes }
}
