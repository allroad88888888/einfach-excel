/**
 * 一件事：**SUMIF / AVERAGEIF 第三个实参（值区）实际覆盖哪个矩形**。
 *
 * Excel 对这两个函数的值区只取**左上角**，行列数由**条件区**决定 —— 值区自己
 * 写成一格、写短、写长、甚至写成整列，都不参与形状：
 *
 * > "The sum_range argument does not have to be the same size and shape as the
 * >  range argument. The actual cells that are added are determined by using
 * >  the upper leftmost cell in the sum_range argument as the beginning cell,
 * >  and then including cells that correspond in size and shape to the range
 * >  argument."  —— Microsoft, SUMIF（AVERAGEIF 的 average_range 同款措辞）
 *
 * 这条规则在本仓有三个消费者，都必须走这里：
 *  1. 稀疏路径 `sparse-single-criterion.ts` —— 它靠 `relativeCoord` 逐格换算，
 *     等价于本矩形，是历史上唯一做对的一条；
 *  2. 物化路径 `criteria-value-range.ts` —— 把值区按本矩形重新读一遍再交给
 *     `FUNCTIONS.SUMIF` / `FUNCTIONS.AVERAGEIF`；
 *  3. 依赖图 `deps.ts` —— 公式读了哪片格子就得依赖哪片，否则 `B1` 之外的格子
 *     变了不会触发重算。
 *
 * 本文件**不 import 求值器**，`deps.ts` 才能安全地用它（那边在 import 图上位于
 * 求值器之外）。
 *
 * ⚠️ 只管 SUMIF / AVERAGEIF 这一档「传统 IF 家族」。`SUMIFS` / `AVERAGEIFS` /
 * `MAXIFS` / `MINIFS` / `COUNTIFS` 是另一条规则：Excel 要求各区形状严格相同，
 * 否则 `#VALUE!` —— 别把这里的宽容套过去。
 */
import type { CellRange, Expr } from '../types'
import { EXCEL_MAX_COL, EXCEL_MAX_ROW, parseRange } from '../refs'

/** 走这条规则的函数名（大写）。 */
export function usesCriteriaValueRect(upperName: string): boolean {
  return upperName === 'SUMIF' || upperName === 'AVERAGEIF'
}

/**
 * 值区实际矩形 = `anchor` 的左上角 + `criteria` 的行列数。
 *
 * 越过网格边界返回 `undefined`（调用方给 `#REF!`）—— 与稀疏路径
 * `relativeCoord` 的越界判定同一口径。
 */
export function criteriaValueRect(
  criteria: CellRange,
  anchor: CellRange,
): CellRange | undefined {
  const rowEnd = anchor.rowStart + (criteria.rowEnd - criteria.rowStart)
  const colEnd = anchor.colStart + (criteria.colEnd - criteria.colStart)
  if (rowEnd > EXCEL_MAX_ROW || colEnd > EXCEL_MAX_COL) return undefined
  return { rowStart: anchor.rowStart, rowEnd, colStart: anchor.colStart, colEnd }
}

/** 两个矩形行列数是否相同 —— 相同就不必重新读值区。 */
export function sameRectShape(a: CellRange, b: CellRange): boolean {
  return (
    a.rowEnd - a.rowStart === b.rowEnd - b.rowStart &&
    a.colEnd - a.colStart === b.colEnd - b.colStart
  )
}

/** 静态可见的引用 → 矩形。`sheetName` 为 `undefined` 表示公式自己那张表。 */
function staticRect(
  expr: Expr,
  sheetName: string | undefined,
): { readonly sheetName?: string; readonly range: CellRange } | undefined {
  if (expr.kind === 'crossSheet') return staticRect(expr.inner, expr.sheetName)
  const range =
    expr.kind === 'ref'
      ? parseRange(expr.a1, expr.a1)
      : expr.kind === 'range'
        ? parseRange(expr.start, expr.end)
        : undefined
  return range ? { sheetName, range } : undefined
}

/**
 * 依赖图要登记的值区矩形 —— `deps.ts` 的入口。
 *
 * `=SUMIF(A1:A3,">1",B1)` 静态上只看得见 `B1` 一个点，实际读到 B1:B3。不把
 * 真实矩形登记进去，B2 / B3 改了不会触发重算 —— 值是对的但会变陈。
 *
 * 返回 `undefined` 时调用方照常按普通实参收集依赖（形状本来就一样、实参不是
 * 静态引用、或矩形越界）。
 */
export function criteriaValueDepRect(
  upperName: string,
  args: ReadonlyArray<Expr>,
  sheetName: string | undefined,
): { readonly sheetName?: string; readonly range: CellRange } | undefined {
  if (!usesCriteriaValueRect(upperName) || args.length !== 3) return undefined
  const criteria = staticRect(args[0], sheetName)
  const anchor = staticRect(args[2], sheetName)
  if (!criteria || !anchor) return undefined
  if (sameRectShape(criteria.range, anchor.range)) return undefined
  const rect = criteriaValueRect(criteria.range, anchor.range)
  return rect ? { sheetName: anchor.sheetName, range: rect } : undefined
}
