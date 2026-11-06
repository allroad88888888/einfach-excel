import type { ChartSpec } from '../spec'

/** 「视为 0」把空值补成 0；「留空」与「连线」保留 null，连线由折线的 connectNulls 处理。 */
export function emptyCellValues(spec: Pick<ChartSpec, 'emptyCells'>,
  values: readonly (readonly (number | null)[])[]): (number | null)[][] {
  return values.map((series) =>
    spec.emptyCells === 'zero' ? series.map((value) => value ?? 0) : [...series])
}
