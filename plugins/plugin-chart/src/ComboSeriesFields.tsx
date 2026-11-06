import { useLingui } from '@lingui/react'
import type { SheetDrawing } from '@einfach-excel/spreadsheet-ui-core'
import { comboSeriesKind, type ChartSpec, type ComboSeriesOption } from './core'
import { labels, typeLabels } from './messages'
import { useChartOption } from './use-chart-option'

const MAX_SERIES_FIELDS = 12

/** 组合图逐系列：柱或线、是否放到次坐标轴；改一项写回一次。 */
export function ComboSeriesFields({ drawing, spec, disabled, patch }: {
  readonly drawing: SheetDrawing
  readonly spec: ChartSpec
  readonly disabled: boolean
  readonly patch: (value: Partial<ChartSpec>) => void
}) {
  const { i18n } = useLingui()
  const { data } = useChartOption(drawing)
  const series = data?.series ?? []
  const update = (index: number, change: ComboSeriesOption) => {
    const combo = Array.from({ length: Math.max(spec.combo.length, index + 1) },
      (_, at) => spec.combo[at] ?? {})
    combo[index] = { ...combo[index], ...change }
    patch({ combo })
  }
  return <fieldset className="plugin-chart-combo" disabled={disabled}>
    <legend>{i18n._(labels.comboSeries)}</legend>
    {series.slice(0, MAX_SERIES_FIELDS).map((entry, index) => {
      const current = comboSeriesKind(spec, index, series.length)
      return <div key={index} className="plugin-chart-combo-row">
        <span>{entry.name}</span>
        <select aria-label={`${entry.name} ${i18n._(labels.comboSeries)}`} value={current.kind}
          onChange={(event) =>
            update(index, { kind: event.currentTarget.value as 'column' | 'line' })}>
          <option value="column">{i18n._(typeLabels.column)}</option>
          <option value="line">{i18n._(typeLabels.line)}</option>
        </select>
        <label className="plugin-chart-toggle">
          <input type="checkbox" checked={current.secondary}
            onChange={(event) => update(index, { secondary: event.currentTarget.checked })} />
          {i18n._(labels.secondaryAxis)}
        </label>
      </div>
    })}
  </fieldset>
}
