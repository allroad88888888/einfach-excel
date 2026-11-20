import { useEffect, useId, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { cycleWorkbookDialogFocus, translateWorkbookFeedback } from '@einfach-excel/react-excel'
import { configureCustomListSortAtom, customListSortPanelAtom } from './core'
import { SortListLevel } from './SortListLevel'
import { labels } from './messages'
import './sort.css'

export function CustomListSortDialog() {
  const { i18n } = useLingui()
  const panel = useAtomValue(customListSortPanelAtom)
  const configure = useSetAtom(configureCustomListSortAtom)
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  const target = panel.target
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || !target) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      dialog.close?.()
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [target])
  if (!target) return null
  return <dialog ref={ref} className="list-sort-dialog" aria-labelledby={`${id}-title`}
    aria-describedby={`${id}-hint`} onKeyDown={cycleWorkbookDialogFocus}
    onCancel={event => { event.preventDefault(); void configure('close') }}>
    <h2 id={`${id}-title`}>{i18n._(labels.title)}</h2>
    <p id={`${id}-hint`}>{i18n._(labels.hint)}</p>
    <p>{i18n._(labels.directory)}</p>
    <form onSubmit={event => { event.preventDefault(); void configure('apply') }}>
      <fieldset disabled={panel.busy} className="list-sort-options">
        <label><input type="checkbox" checked={panel.hasHeader}
          onChange={event => void configure({ type: 'header', value: event.currentTarget.checked })} />
          {i18n._(labels.header)}</label>
        <label><input type="checkbox" checked={panel.caseSensitive}
          onChange={event => void configure({ type: 'case-sensitive', value: event.currentTarget.checked })} />
          {i18n._(labels.case)}</label>
        <label>{i18n._(labels.empty)}
          <select value={panel.emptyFirst ? 'first' : 'last'} onChange={event =>
            void configure({ type: 'empty-first', value: event.currentTarget.value === 'first' })}>
            <option value="last">{i18n._(labels.last)}</option>
            <option value="first">{i18n._(labels.first)}</option>
          </select>
        </label>
      </fieldset>
      {panel.keys.map((_, index) => <SortListLevel key={index} index={index} />)}
      <button type="button"
        disabled={panel.busy || panel.keys.length >=
          Math.min(8, target.range.colEnd - target.range.colStart + 1)}
        onClick={() => void configure('add')}>{i18n._(labels.add)}</button>
      {panel.error && <p role="alert" className="list-sort-error">
        {i18n._(labels[panel.error])}
        {panel.detail && <span>{translateWorkbookFeedback(i18n, panel.detail)}</span>}
      </p>}
      {panel.busy && <p role="status">{i18n._(labels.applying)}</p>}
      <div className="list-sort-actions">
        <button type="submit" disabled={panel.busy}>{i18n._(labels.apply)}</button>
        <button type="button" disabled={panel.busy}
          onClick={() => void configure('close')}>{i18n._(labels.cancel)}</button>
      </div>
    </form>
  </dialog>
}
