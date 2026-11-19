import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { getColumnLabel } from '@einfach-excel/spreadsheet-ui-core'
import { colorSortPanelAtom, configureColorSortAtom, newColorSortLevel,
  type ColorSortLevel, type ColorSortMode } from './core/color-sort'
import { colorLabels } from './color-messages'
import { labels } from './messages'

export function ColorSortLevelFields({ index }: { readonly index: number }) {
  const { i18n } = useLingui()
  const panel = useAtomValue(colorSortPanelAtom)
  const configure = useSetAtom(configureColorSortAtom)
  const level = panel.keys[index]
  if (!level || !panel.target) return null
  const values = { level: index + 1 }
  const { colStart, colEnd } = panel.target
  const columns = Array.from({ length: colEnd - colStart + 1 }, (_, offset) => colStart + offset)
  const update = (key: ColorSortLevel) => void configure({ type: 'key', index, key })
  const mode = 'sortOn' in level ? level.sortOn : 'value'
  const order = i18n._({ ...labels.order, values })
  return <fieldset disabled={panel.busy}>
    <legend>{i18n._({ ...labels.level, values })}</legend>
    <label>{i18n._({ ...labels.column, values })}
      <select aria-label={i18n._({ ...labels.column, values })} value={level.col}
        onChange={event => update({ ...level, col: Number(event.currentTarget.value) })}>
        {columns.map(col => <option key={col} value={col}>{getColumnLabel(col)}</option>)}
      </select>
    </label>
    <label>{i18n._(colorLabels.kind)}
      <select aria-label={i18n._(colorLabels.kind)} value={mode} onChange={event => {
        const next = event.currentTarget.value as ColorSortMode
        update(newColorSortLevel(level.col, next))
      }}>
        <option value="cell-color">{i18n._(colorLabels.fill)}</option>
        <option value="font-color">{i18n._(colorLabels.font)}</option>
        <option value="value">{i18n._(labels.values)}</option>
      </select>
    </label>
    {'sortOn' in level ? <>
      <label>
        <input type="checkbox" checked={level.color === null}
          onChange={event => update({ ...level, color: event.currentTarget.checked ? null : '#ff0000' })} />
        {i18n._(level.sortOn === 'cell-color' ? colorLabels.noFill : colorLabels.automatic)}
      </label>
      {level.color !== null && <label>{i18n._(colorLabels.target)}
        <input type="color" value={level.color}
          onChange={event => update({ ...level, color: event.currentTarget.value })} />
      </label>}
      <label>{order}<select aria-label={order} value={level.position}
        onChange={event => update({ ...level, position: event.currentTarget.value as 'top' | 'bottom' })}>
        <option value="top">{i18n._(colorLabels.top)}</option>
        <option value="bottom">{i18n._(colorLabels.bottom)}</option>
      </select></label>
    </> : <label>{order}<select aria-label={order} value={level.direction}
      onChange={event => update({ ...level, direction: event.currentTarget.value as 'asc' | 'desc' })}>
      <option value="asc">{i18n._(labels.asc)}</option>
      <option value="desc">{i18n._(labels.desc)}</option>
    </select></label>}
    <div className="list-sort-actions">
      {(['up', 'down'] as const).map(direction => <button key={direction} type="button"
        aria-label={i18n._({ ...labels[direction === 'up' ? 'moveUp' : 'moveDown'], values })}
        disabled={direction === 'up' ? index === 0 : index === panel.keys.length - 1}
        onClick={() => void configure({ type: 'move', index, direction })}>{i18n._(labels[direction])}</button>)}
      <button type="button" aria-label={i18n._({ ...labels.removeLevel, values })}
        disabled={panel.keys.length === 1} onClick={() => void configure({ type: 'remove', index })}>
        {i18n._(labels.remove)}
      </button>
    </div>
  </fieldset>
}
