import type { FunctionImpl } from '../../../types'
import { averageTierNumber, matchesCriterion, parseCriterion } from '../../criteria-grammar'
import { ERR_VAL, NUM } from './numeric'
import { collectPairs } from './criteria-counting'
import { flatten, valueShape, sameValueShape } from './values'

/** AVERAGEIF(range, criterion, [averageRange]) */
export const AVERAGEIF: FunctionImpl = (args, _ctx) => {
  if (args.length < 2 || args.length > 3) return ERR_VAL('#VALUE!')
  const [range, criterion, avgRange] = args
  const parsed = parseCriterion(criterion)
  if ('error' in parsed) return parsed.error
  // average_range 实参本身是错误 → 传播（同 SUMIF 的 sum_range）。
  if (avgRange?.kind === 'error') return avgRange
  // average_range 与 SUMIF 的 sum_range 同一条规则：只取左上角，行列数由条件区
  // 决定（见 `eval/criteria-value-rect.ts`）。实参是引用时求值器已经把它重读成
  // 同形；这里剩下非引用实参的兜底 —— 形状对不上才 `#VALUE!`。
  //
  // ⚠️ 曾经这条 `sameValueShape` 是无条件的，于是 `AVERAGEIF(A1:A3,">1",B1)`
  // 给 `#VALUE!`（Excel 250）。稀疏孪生 `evaluateSparseAverageIf` 当时也有同款
  // 守卫，两条路一起错 —— 一起改了，配对断言见 `test/criteria-value-range.test.ts`。
  if (avgRange && !sameValueShape(range, avgRange)) return ERR_VAL('#VALUE!')
  const checkCells = flatten(range)
  const sumCells = avgRange ? flatten(avgRange) : checkCells
  let total = 0
  let count = 0
  for (let i = 0; i < checkCells.length; i++) {
    const probe = checkCells[i]
    // 条件区错误格按显示文本参与比较（同 COUNTIF / SUMIF）；平均区错误格照旧传播。
    if (!matchesCriterion(probe, parsed)) continue
    const target = sumCells[i]
    if (target.kind === 'error') return target
    // 分母只数真正的数字（`averageTierNumber`）—— 空格 / 布尔 / 文本都不算。
    const num = averageTierNumber(target)
    if (num !== undefined) {
      total += num
      count++
    }
  }
  if (count === 0) return ERR_VAL('#DIV/0!')
  return NUM(total / count)
}

/** AVERAGEIFS(averageRange, range1, crit1, ...) */
export const AVERAGEIFS: FunctionImpl = (args, _ctx) => {
  if (args.length < 3 || args.length % 2 === 0) return ERR_VAL('#VALUE!')
  const sumCells = flatten(args[0])
  const pairs = collectPairs(args.slice(1))
  if ('error' in pairs) return pairs.error
  const len = sumCells.length
  const sumShape = valueShape(args[0])
  for (const shape of pairs.shapes) {
    if (shape.rows !== sumShape.rows || shape.cols !== sumShape.cols) return ERR_VAL('#VALUE!')
  }
  let total = 0
  let count = 0
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
    // 与 AVERAGEIF 同一条分母口径（`averageTierNumber`）。
    const num = averageTierNumber(target)
    if (num !== undefined) {
      total += num
      count++
    }
  }
  if (count === 0) return ERR_VAL('#DIV/0!')
  return NUM(total / count)
}

/** MAXIFS(maxRange, range1, crit1, ...) — modern Excel function. */
export const MAXIFS: FunctionImpl = (args, _ctx) => {
  if (args.length < 3 || args.length % 2 === 0) return ERR_VAL('#VALUE!')
  const targetCells = flatten(args[0])
  const pairs = collectPairs(args.slice(1))
  if ('error' in pairs) return pairs.error
  const len = targetCells.length
  const targetShape = valueShape(args[0])
  for (const shape of pairs.shapes) {
    if (shape.rows !== targetShape.rows || shape.cols !== targetShape.cols) return ERR_VAL('#VALUE!')
  }
  let best = Number.NEGATIVE_INFINITY
  let seen = false
  outer: for (let i = 0; i < len; i++) {
    for (let j = 0; j < pairs.flats.length; j++) {
      const cell = pairs.flats[j][i]
      // 条件区里的错误格不短路：按显示文本参与比较，命不命中交给
      // `matchesCriterion`（与正上方 COUNTIF / SUMIF 同一口径 —— Excel 只有
      // 一套 criteria 语义）。值区那一档照常传播。
      if (!matchesCriterion(cell, pairs.parsed[j])) continue outer
    }
    const target = targetCells[i]
    if (target.kind === 'error') return target
    if (target.kind === 'number') {
      if (target.value > best) best = target.value
      seen = true
    }
  }
  return NUM(seen ? best : 0)
}

/** MINIFS(minRange, range1, crit1, ...) */
export const MINIFS: FunctionImpl = (args, _ctx) => {
  if (args.length < 3 || args.length % 2 === 0) return ERR_VAL('#VALUE!')
  const targetCells = flatten(args[0])
  const pairs = collectPairs(args.slice(1))
  if ('error' in pairs) return pairs.error
  const len = targetCells.length
  const targetShape = valueShape(args[0])
  for (const shape of pairs.shapes) {
    if (shape.rows !== targetShape.rows || shape.cols !== targetShape.cols) return ERR_VAL('#VALUE!')
  }
  let best = Number.POSITIVE_INFINITY
  let seen = false
  outer: for (let i = 0; i < len; i++) {
    for (let j = 0; j < pairs.flats.length; j++) {
      const cell = pairs.flats[j][i]
      // 条件区里的错误格不短路：按显示文本参与比较，命不命中交给
      // `matchesCriterion`（与正上方 COUNTIF / SUMIF 同一口径 —— Excel 只有
      // 一套 criteria 语义）。值区那一档照常传播。
      if (!matchesCriterion(cell, pairs.parsed[j])) continue outer
    }
    const target = targetCells[i]
    if (target.kind === 'error') return target
    if (target.kind === 'number') {
      if (target.value < best) best = target.value
      seen = true
    }
  }
  return NUM(seen ? best : 0)
}
