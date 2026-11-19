import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import {
  nativeFilterPanelAtom, validFilterColorValue, type FilterColorSource,
} from '@einfach-excel/spreadsheet-ui-core'
import { configureColorFilterAtom } from './core'
import { colorLabels as labels } from './color-messages'
import { ColorChoices } from './ColorChoices'

export function ColorFields({ index }: { readonly index: number }) {
  const { i18n } = useLingui()
  const configure = useSetAtom(configureColorFilterAtom)
  const { conditions } = useAtomValue(nativeFilterPanelAtom)
  const condition = conditions[index]
  if (!condition) return null
  const rule = condition.nativeRule
  if (condition.kind !== 'color' || rule?.kind !== 'color') return <button type="button"
    data-filter-condition="color" onClick={() => void configure({ type: 'activate', index })}>
    {i18n._(labels.activate)}
  </button>
  const values = { number: index + 1 }
  const automatic = rule.color === 'automatic'
  const automaticLabel = i18n._(rule.source === 'fill' ? labels.noFill : labels.automatic)
  const invalid = !validFilterColorValue(rule.color)
  const setColor = (value: string) => void configure({ type: 'color', index, value })
  return <div className="filter-color-fields" data-filter-condition="color">
    <label>{i18n._({ ...labels.source, values })}
      <select value={rule.source} onChange={event => void configure({
        type: 'source', index, value: event.currentTarget.value as FilterColorSource,
      })}>
        <option value="fill">{i18n._(labels.fill)}</option>
        <option value="font">{i18n._(labels.font)}</option>
      </select>
    </label>
    <div className="filter-color-target">
      <button type="button" aria-pressed={automatic} onClick={() => setColor('automatic')}>
        {automaticLabel}
      </button>
      <label>{i18n._({ ...labels.hex, values })}
        <input type="text" autoComplete="off" spellCheck={false} maxLength={7}
          placeholder="#RRGGBB" aria-invalid={invalid} value={automatic ? '' : rule.color}
          onChange={event => setColor(event.currentTarget.value.trim() || 'automatic')} />
      </label>
      {invalid && <p className="size-error" role="status">{i18n._(labels.invalid)}</p>}
    </div>
    <ColorChoices index={index} selected={rule.color}
      automaticLabel={automaticLabel} onChoose={setColor} />
  </div>
}
