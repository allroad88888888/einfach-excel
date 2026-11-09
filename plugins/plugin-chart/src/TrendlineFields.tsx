import { useLingui } from '@lingui/react'
import type { SheetDrawing } from '@einfach-excel/spreadsheet-ui-core'
import { DEFAULT_TRENDLINE, MAX_TRENDLINE_ORDER, MAX_TRENDLINE_PERIOD, MIN_TRENDLINE_ORDER,
  MIN_TRENDLINE_PERIOD, TRENDLINE_KINDS, type ChartSpec, type Trendline,
  type TrendlineKind } from './core'
import { designLabels, trendlineLabels } from './design-messages'
import { Choice, NumberField, Toggle } from './settings-fields'
import { useChartOption } from './use-chart-option'

const MAX_SERIES_FIELDS = 12

const clamp = (value: number | null, min: number, max: number, fallback: number) =>
  value === null ? fallback : Math.round(Math.min(max, Math.max(min, value)))

/** 趋势线按系列设置（同 Excel：每个系列可以有自己的趋势线类型）。 */
export function TrendlineFields({ drawing, spec, disabled, patch }: {
  readonly drawing: SheetDrawing
  readonly spec: ChartSpec
  readonly disabled: boolean
  readonly patch: (value: Partial<ChartSpec>) => void
}) {
  const { i18n } = useLingui()
  const { data } = useChartOption(drawing)
  const series = data?.series.slice(0, MAX_SERIES_FIELDS) ?? []
  const kinds = [{ value: 'none' as const, label: i18n._(designLabels.none) },
    ...TRENDLINE_KINDS.map((value) => ({ value, label: i18n._(trendlineLabels[value]) }))]
  const setTrend = (index: number, trend: Trendline | null) => {
    const trendlines = Array.from({ length: Math.max(spec.trendlines.length, index + 1) },
      (_, at) => spec.trendlines[at] ?? null)
    trendlines[index] = trend
    while (trendlines.length && !trendlines[trendlines.length - 1]) trendlines.pop()
    patch({ trendlines })
  }
  return <fieldset className="plugin-chart-analysis" disabled={disabled}>
    <legend>{i18n._(designLabels.trendlines)}</legend>
    {series.map((entry, index) => {
      const trend = spec.trendlines[index] ?? null
      const update = (value: Partial<Trendline>) => setTrend(index, { ...trend!, ...value })
      return <div key={index} className="plugin-chart-analysis-row" data-trend-series={index}>
        <span title={entry.name}>{entry.name}</span>
        <Choice<TrendlineKind | 'none'> label={i18n._(designLabels.trendline)}
          value={trend?.kind ?? 'none'} disabled={disabled} options={kinds}
          onChange={(kind) => setTrend(index, kind === 'none' ? null
            : { ...DEFAULT_TRENDLINE, ...trend, kind })} />
        {trend?.kind === 'polynomial' && <NumberField label={i18n._(designLabels.order)}
          value={trend.order} placeholder={String(MIN_TRENDLINE_ORDER)} disabled={disabled}
          onCommit={(order) => update({ order: clamp(order, MIN_TRENDLINE_ORDER,
            MAX_TRENDLINE_ORDER, DEFAULT_TRENDLINE.order) })} />}
        {trend?.kind === 'movingAverage' && <NumberField label={i18n._(designLabels.period)}
          value={trend.period} placeholder={String(MIN_TRENDLINE_PERIOD)} disabled={disabled}
          onCommit={(period) => update({ period: clamp(period, MIN_TRENDLINE_PERIOD,
            MAX_TRENDLINE_PERIOD, DEFAULT_TRENDLINE.period) })} />}
        {trend && trend.kind !== 'movingAverage' && <>
          <Toggle label={i18n._(designLabels.showEquation)} checked={trend.showEquation}
            disabled={disabled} onChange={(showEquation) => update({ showEquation })} />
          <Toggle label={i18n._(designLabels.showR2)} checked={trend.showR2}
            disabled={disabled} onChange={(showR2) => update({ showR2 })} />
        </>}
      </div>
    })}
  </fieldset>
}
