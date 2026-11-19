import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { configureVisualSortAtom, visualSortPanelAtom } from './core/visual-sort'
import { labels } from './messages'

export function HorizontalSortOptions() {
  const { i18n } = useLingui()
  const { busy, caseSensitive, emptyFirst } = useAtomValue(visualSortPanelAtom)
  const configure = useSetAtom(configureVisualSortAtom)
  return <>
    <label>
      <input type="checkbox" checked={caseSensitive} disabled={busy}
        onChange={event => void configure({ type: 'case', value: event.currentTarget.checked })} />
      {i18n._(labels.case)}
    </label>
    <label>{i18n._(labels.empty)}
      <select aria-label={i18n._(labels.empty)} value={emptyFirst ? 'first' : 'last'} disabled={busy}
        onChange={event => void configure({ type: 'empty', value: event.currentTarget.value === 'first' })}>
        <option value="last">{i18n._(labels.last)}</option>
        <option value="first">{i18n._(labels.first)}</option>
      </select>
    </label>
  </>
}
