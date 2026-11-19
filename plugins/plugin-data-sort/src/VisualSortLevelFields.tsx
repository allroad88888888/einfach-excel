import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { getColumnLabel } from '@einfach-excel/spreadsheet-ui-core'
import { visualSortPanelAtom, configureVisualSortAtom, newVisualSortLevel,
  type VisualSortLevel, type VisualSortMode } from './core/visual-sort'
import { colorLabels } from './color-messages'
import { IconSortTargetFields } from './IconSortTargetFields'
import { iconLabels } from './icon-messages'
import { horizontalLabels } from './horizontal-messages'
import { labels } from './messages'

export function VisualSortLevelFields({ index }: { readonly index: number }) {
  const { i18n } = useLingui()
  const panel = useAtomValue(visualSortPanelAtom)
  const configure = useSetAtom(configureVisualSortAtom)
  const level = panel.keys[index]
  if (!level || !panel.target) return null
  const values = { level: index + 1 }
  const { colStart, colEnd } = panel.target
  const horizontal = 'row' in level
  const update = (key: VisualSortLevel) => void configure({ type: 'key', index, key })
  const mode = 'sortOn' in level ? level.sortOn : 'value'
  const order = i18n._({ ...labels.order, values })
  return <fieldset disabled={panel.busy}>
    <legend>{i18n._({ ...labels.level, values })}</legend>
    {horizontal ? <label>{i18n._({ ...horizontalLabels.row, values })}
      <input type="number" inputMode="numeric" required step={1}
        min={panel.target.rowStart + 1} max={panel.target.rowEnd + 1}
        aria-label={i18n._({ ...horizontalLabels.row, values })}
        value={Number.isFinite(level.row) ? level.row + 1 : ''}
        onChange={event => update({ ...level, row: event.currentTarget.valueAsNumber - 1 })} />
    </label> : <label>{i18n._({ ...labels.column, values })}
      <select aria-label={i18n._({ ...labels.column, values })} value={level.col}
        onChange={event => update({ ...level, col: Number(event.currentTarget.value) })}>
        {Array.from({ length: colEnd - colStart + 1 }, (_, i) => i + colStart)
          .map(col => <option key={col} value={col}>{getColumnLabel(col)}</option>)}
      </select>
    </label>}
    <label>{i18n._(colorLabels.kind)}
      <select aria-label={i18n._(colorLabels.kind)} value={mode} onChange={event => {
        const next = event.currentTarget.value as VisualSortMode
        update(newVisualSortLevel(horizontal ? { row: level.row } : { col: level.col }, next))
      }}>
        <option value="cell-color">{i18n._(colorLabels.fill)}</option>
        <option value="font-color">{i18n._(colorLabels.font)}</option>
        <option value="icon">{i18n._(iconLabels.criterion)}</option>
        <option value="value">{i18n._(labels.values)}</option>
      </select>
    </label>
    {'sortOn' in level ? <>
      {level.sortOn === 'icon' ? <IconSortTargetFields index={index} /> : <>
        <label>
          <input type="checkbox" checked={level.color === null} onChange={event => update({
            ...level, color: event.currentTarget.checked ? null : '#ff0000',
          })} />
          {i18n._(level.sortOn === 'cell-color' ? colorLabels.noFill : colorLabels.automatic)}
        </label>
        {level.color !== null && <label>{i18n._(colorLabels.target)}
          <input type="color" value={level.color}
            onChange={event => update({ ...level, color: event.currentTarget.value })} />
        </label>}
      </>}
      <label>{order}<select aria-label={order} value={level.position} onChange={event => {
        const position = event.currentTarget.value
        if (horizontal) update({ ...level, position: position as 'left' | 'right' })
        else update({ ...level, position: position as 'top' | 'bottom' })
      }}>
        <option value={horizontal ? 'left' : 'top'}>
          {i18n._(horizontal ? horizontalLabels.left : colorLabels.top)}
        </option>
        <option value={horizontal ? 'right' : 'bottom'}>
          {i18n._(horizontal ? horizontalLabels.right : colorLabels.bottom)}
        </option>
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
