import { useLingui } from '@lingui/react'
import { useId } from 'react'
import { CHART_PALETTES, QUICK_LAYOUTS, quickLayoutPatch, type ChartSpec,
  type QuickLayout } from './core'
import { designLabels, layoutLabels, paletteLabels } from './design-messages'
import { labels } from './messages'
import { Choice } from './settings-fields'

/**
 * 图表设计：快速布局是一次性动作（套用一组元素显隐，之后可逐项再改），
 * 所以下拉框选完即回到占位项；「更改颜色」是持久的配色方案。
 */
export function ChartDesignFields({ spec, disabled, patch }: {
  readonly spec: ChartSpec
  readonly disabled: boolean
  readonly patch: (value: Partial<ChartSpec>) => void
}) {
  const { i18n } = useLingui()
  const id = useId()
  const words = { title: i18n._(labels.title), axisTitle: i18n._(designLabels.axisTitle) }
  return <>
    <div className="plugin-chart-field">
      <label htmlFor={id}>{i18n._(designLabels.quickLayout)}</label>
      <select id={id} value="" disabled={disabled}
        onChange={(event) => {
          const layout = event.currentTarget.value as QuickLayout
          if (layout) patch(quickLayoutPatch(layout, spec, words))
        }}>
        <option value="">—</option>
        {QUICK_LAYOUTS.map((layout) =>
          <option key={layout} value={layout}>{i18n._(layoutLabels[layout])}</option>)}
      </select>
    </div>
    <Choice label={i18n._(designLabels.palette)} value={spec.palette} disabled={disabled}
      options={CHART_PALETTES.map((value) => ({ value, label: i18n._(paletteLabels[value]) }))}
      onChange={(palette) => patch({ palette })} />
  </>
}
