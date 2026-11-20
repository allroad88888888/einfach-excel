import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { nativeFilterPanelAtom } from '@einfach-excel/spreadsheet-ui-core'
import { configureTopFilterAtom } from './core'
import { labels } from './messages'

export function TopFilterFields({ index }: { readonly index: number }) {
  const { i18n } = useLingui()
  const configure = useSetAtom(configureTopFilterAtom)
  const condition = useAtomValue(nativeFilterPanelAtom).conditions[index]
  if (!condition) return null
  const rule = condition.nativeRule
  if (condition.kind !== 'top' || rule?.kind !== 'top') return <button type="button"
    data-filter-condition="top" onClick={() => void configure({ type: 'activate', index })}>
    {i18n._(labels.activate)}
  </button>
  const values = { number: index + 1 }
  return <div className="filter-top-fields" data-filter-condition="top">
    <label>{i18n._({ ...labels.direction, values })}
      <select aria-label={i18n._({ ...labels.direction, values })} value={rule.direction}
        onChange={event => void configure({ type: 'direction', index,
          value: event.currentTarget.value as 'top' | 'bottom' })}>
        <option value="top">{i18n._(labels.top)}</option>
        <option value="bottom">{i18n._(labels.bottom)}</option>
      </select>
    </label>
    <label>{i18n._({ ...labels.amount, values })}
      <input type="number" min={1} max={rule.unit === 'items' ? 500 : 100} step={1} required
        aria-label={i18n._({ ...labels.amount, values })}
        value={Number.isFinite(rule.value) ? rule.value : ''}
        onChange={event => void configure({ type: 'amount', index, value: event.currentTarget.value })} />
    </label>
    <label>{i18n._({ ...labels.unit, values })}
      <select aria-label={i18n._({ ...labels.unit, values })} value={rule.unit}
        onChange={event => void configure({ type: 'unit', index,
          value: event.currentTarget.value as 'items' | 'percent' })}>
        <option value="items">{i18n._(labels.items)}</option>
        <option value="percent">{i18n._(labels.percent)}</option>
      </select>
    </label>
    <p className="size-hint">{i18n._(labels.hint)}</p>
  </div>
}
