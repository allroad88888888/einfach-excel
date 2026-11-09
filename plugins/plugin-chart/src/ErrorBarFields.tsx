import { useLingui } from '@lingui/react'
import { DEFAULT_ERROR_AMOUNT, ERROR_BAR_DIRECTIONS, ERROR_BAR_KINDS, type ChartSpec,
  type ErrorBarKind } from './core'
import { designLabels, errorBarLabels, errorDirectionLabels } from './design-messages'
import { Choice, NumberField } from './settings-fields'

/** 误差线：整张图一套（同 Excel 图表元素里的「误差线」），作用于每个系列。 */
export function ErrorBarFields({ spec, disabled, patch }: {
  readonly spec: ChartSpec
  readonly disabled: boolean
  readonly patch: (value: Partial<ChartSpec>) => void
}) {
  const { i18n } = useLingui()
  const bars = spec.errorBars
  const kinds = [{ value: 'none' as const, label: i18n._(designLabels.none) },
    ...ERROR_BAR_KINDS.map((value) => ({ value, label: i18n._(errorBarLabels[value]) }))]
  return <fieldset className="plugin-chart-analysis" disabled={disabled}>
    <Choice<ErrorBarKind | 'none'> label={i18n._(designLabels.errorBars)}
      value={bars?.kind ?? 'none'} disabled={disabled} options={kinds}
      onChange={(kind) => patch({ errorBars: kind === 'none' ? null : {
        kind, amount: DEFAULT_ERROR_AMOUNT[kind], direction: bars?.direction ?? 'both' } })} />
    {bars && bars.kind !== 'stdErr' && <NumberField label={i18n._(designLabels.errorAmount)}
      value={bars.amount} placeholder={String(DEFAULT_ERROR_AMOUNT[bars.kind])}
      disabled={disabled} onCommit={(amount) => patch({ errorBars: { ...bars,
        amount: amount === null || amount < 0 ? DEFAULT_ERROR_AMOUNT[bars.kind] : amount } })} />}
    {bars && <Choice label={i18n._(designLabels.errorDirection)} value={bars.direction}
      disabled={disabled}
      options={ERROR_BAR_DIRECTIONS.map((value) =>
        ({ value, label: i18n._(errorDirectionLabels[value]) }))}
      onChange={(direction) => patch({ errorBars: { ...bars, direction } })} />}
  </fieldset>
}
