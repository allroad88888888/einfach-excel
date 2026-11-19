import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { SUBTOTAL_FUNCTIONS, toA1, type SubtotalFunction } from '@einfach-excel/spreadsheet-ui-core'
import { configureSubtotalAtom, subtotalPanelAtom } from './core'
import { subtotalLabels as labels } from './messages'

export function SubtotalFields() {
  const { i18n } = useLingui()
  const panel = useAtomValue(subtotalPanelAtom)
  const configure = useSetAtom(configureSubtotalAtom)
  if (!panel?.list) return null
  const { draft, list } = panel
  const range = list.range
  return <fieldset disabled={panel.busy}>
    <label className="subtotal-field">{i18n._(labels.list)}
      <input readOnly value={`${toA1(range.rowStart, range.colStart)}:${toA1(range.rowEnd, range.colEnd)}`} />
    </label>
    <label className="subtotal-field">{i18n._(labels.group)}
      <select value={draft.groupByColumn} onChange={event => void configure({ patch: {
        groupByColumn: Number(event.target.value),
      } })}>
        {list.fields.map(field =>
          <option key={field.column} value={field.column}>{field.name}</option>)}
      </select>
    </label>
    <label className="subtotal-field">{i18n._(labels.function)}
      <select value={draft.function} onChange={event => void configure({ patch: {
        function: event.target.value as SubtotalFunction,
      } })}>
        {SUBTOTAL_FUNCTIONS.map(fn => <option key={fn} value={fn}>{i18n._(labels[fn])}</option>)}
      </select>
    </label>
    <fieldset className="subtotal-columns">
      <legend>{i18n._(labels.fields)}</legend>
      {list.fields.map(field =>
        <label key={field.column}>
          <input type="checkbox" checked={draft.columns.includes(field.column)} onChange={event => {
            const columns = event.target.checked ? [...draft.columns, field.column]
              : draft.columns.filter(column => column !== field.column)
            void configure({ patch: { columns } })
          }} />
          {field.name}
        </label>)}
    </fieldset>
    {list.placement && <label>
      <input type="checkbox" checked={draft.replace}
        onChange={event => void configure({ patch: { replace: event.target.checked } })} />
      {i18n._(labels.replace)}
    </label>}
    <label>
      <input type="checkbox" checked={draft.placement === 'below'} onChange={event => void configure({
        patch: { placement: event.target.checked ? 'below' : 'above' },
      })} />
      {i18n._(labels.below)}
    </label>
  </fieldset>
}
