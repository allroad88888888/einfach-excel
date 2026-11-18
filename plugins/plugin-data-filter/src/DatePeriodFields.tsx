import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { filterDatePeriods, nativeFilterPanelAtom, type FilterDatePeriod } from '@einfach-excel/spreadsheet-ui-core'
import { configureDatePeriodFilterAtom } from './core'
import { dateLabels, periodLabel } from './date-messages'

export function DatePeriodFields({ index }: { readonly index: number }) {
  const { i18n } = useLingui()
  const configure = useSetAtom(configureDatePeriodFilterAtom)
  const condition = useAtomValue(nativeFilterPanelAtom).conditions[index]
  if (!condition) return null
  const rule = condition.nativeRule
  if (condition.kind !== 'date-period' || rule?.kind !== 'date-period') return <button type="button"
    data-filter-condition="date-period" onClick={() => void configure({ type: 'activate', index })}>
    {i18n._(dateLabels.activate)}
  </button>
  const label = i18n._({ ...dateLabels.period, values: { number: index + 1 } })
  return <div className="filter-date-fields" data-filter-condition="date-period">
    <label>{label}
      <select aria-label={label} value={rule.period} onChange={event =>
        void configure({ type: 'period', index, value: event.currentTarget.value as FilterDatePeriod })}>
        {filterDatePeriods.map(period => <option key={period} value={period}>
          {i18n._(periodLabel(period))}
        </option>)}
      </select>
    </label>
    <p className="size-hint">{i18n._(dateLabels.hint)}</p>
  </div>
}
