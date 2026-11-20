import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { getColumnLabel, namedListDirectoryAtom } from '@einfach-excel/spreadsheet-ui-core'
import { configureCustomListSortAtom, customListSortPanelAtom } from './core'
import { labels } from './messages'

/** One level reads the current directory directly; disappearing choices stay visibly invalid. */
export function SortListLevel({ index }: { readonly index: number }) {
  const { i18n } = useLingui()
  const panel = useAtomValue(customListSortPanelAtom)
  const directory = useAtomValue(namedListDirectoryAtom)
  const configure = useSetAtom(configureCustomListSortAtom)
  const key = panel.keys[index]
  if (!panel.target || !key) return null
  const count = panel.target.range.colEnd - panel.target.range.colStart + 1
  const columns = Array.from({ length: count },
    (_, offset) => panel.target!.range.colStart + offset)
  const selected = directory.find(list => list.listName === key.listName)
  const values = { level: index + 1 }
  return <fieldset disabled={panel.busy}>
    <legend>{i18n._({ ...labels.level, values })}</legend>
    <label>{i18n._({ ...labels.column, values })}
      <select aria-label={i18n._({ ...labels.column, values })}
        data-list-sort-column={index} value={key.col}
        onChange={event => void configure({ type: 'key', index,
          key: { ...key, col: Number(event.currentTarget.value) } })}>
        {columns.map(col => <option key={col} value={col}
          disabled={panel.keys.some((other, i) => i !== index && other.col === col)}>
          {getColumnLabel(col)}
        </option>)}
      </select>
    </label>
    <label>{i18n._({ ...labels.list, values })}
      <select aria-label={i18n._({ ...labels.list, values })} value={key.listName} onChange={event => void configure({ type: 'key', index,
        key: { ...key, listName: event.currentTarget.value } })}>
        <option value="">{i18n._(labels.values)}</option>
        {key.listName && !selected && <option value={key.listName} disabled>
          {i18n._(labels.missing)}
        </option>}
        {directory.map(list => <option key={list.listName} value={list.listName}>
          {list.listName === 'locale-weekday' ? i18n._(labels.weekday)
            : list.listName === 'locale-month' ? i18n._(labels.month)
              : list.listName.slice(list.listName.indexOf(':') + 1)}
        </option>)}
      </select>
    </label>
    {selected && <p className="list-sort-preview">{selected.values.join(' → ')}</p>}
    <label>{i18n._({ ...labels.order, values })}
      <select aria-label={i18n._({ ...labels.order, values })} value={key.direction}
        onChange={event => {
        const direction = event.currentTarget.value
        if (direction === 'asc' || direction === 'desc')
          void configure({ type: 'key', index, key: { ...key, direction } })
      }}>
        <option value="asc">{i18n._(labels.asc)}</option>
        <option value="desc">{i18n._(labels.desc)}</option>
      </select>
    </label>
    <div className="list-sort-actions">
      {(['up', 'down'] as const).map(direction => <button key={direction} type="button"
        aria-label={i18n._({ ...labels[direction === 'up' ? 'moveUp' : 'moveDown'], values })}
        disabled={direction === 'up' ? index === 0 : index === panel.keys.length - 1}
        onClick={async event => {
          const dialog = event.currentTarget.closest('dialog')
          if (await configure({ type: 'move', index, direction }))
            dialog?.querySelector<HTMLSelectElement>(
              `[data-list-sort-column="${index + (direction === 'up' ? -1 : 1)}"]`)?.focus()
        }}>{i18n._(labels[direction])}</button>)}
      <button type="button" aria-label={i18n._({ ...labels.removeLevel, values })}
        disabled={panel.keys.length === 1}
        onClick={() => void configure({ type: 'remove', index })}>{i18n._(labels.remove)}</button>
    </div>
  </fieldset>
}
