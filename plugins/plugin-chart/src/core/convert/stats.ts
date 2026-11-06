export interface BoxStats {
  readonly min: number
  readonly q1: number
  readonly median: number
  readonly q3: number
  readonly max: number
  readonly mean: number
  /** 落在 1.5 倍四分位距之外的点。min / max 是须线端点（范围内的极值）。 */
  readonly outliers: readonly number[]
}

function medianOf(sorted: readonly number[]): number {
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * 箱线图统计量，四分位用 Excel 默认的「排除中位数」口径：
 * 样本数为奇数时，中位数那一个值不计入上下两半，Q1 / Q3 分别是下半、上半的中位数。
 * 须线伸到 1.5 × IQR 以内的最远数据点，更远的是离群点。输入至少一个数。
 */
export function boxStats(values: readonly number[]): BoxStats {
  const sorted = [...values].sort((a, b) => a - b)
  const half = sorted.length >> 1
  const lower = sorted.slice(0, half)
  const upper = sorted.slice(sorted.length - half)
  const median = medianOf(sorted)
  // 只有一个数时没有上下两半，四分位都退化为它自己。
  const q1 = lower.length ? medianOf(lower) : median
  const q3 = upper.length ? medianOf(upper) : median
  const fence = 1.5 * (q3 - q1)
  const inside = sorted.filter((value) => value >= q1 - fence && value <= q3 + fence)
  return {
    min: inside[0]!, q1, median, q3, max: inside[inside.length - 1]!,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    outliers: sorted.filter((value) => value < q1 - fence || value > q3 + fence),
  }
}
