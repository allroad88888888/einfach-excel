import { useEffect, useId, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { cycleWorkbookDialogFocus, translateWorkbookFeedback } from '@einfach-excel/react-excel'
import { colorSortPanelAtom, configureColorSortAtom } from './core/color-sort'
import { ColorSortLevelFields } from './ColorSortLevelFields'
import { colorLabels } from './color-messages'
import { labels } from './messages'
import './sort.css'

export function ColorSortDialog() {
  const { i18n } = useLingui()
  const panel = useAtomValue(colorSortPanelAtom)
  const configure = useSetAtom(configureColorSortAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const title = useId()
  const open = panel.target !== null
  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      dialog.close?.()
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [open])
  if (!open) return null
  return <dialog ref={dialogRef} className="list-sort-dialog" aria-labelledby={title}
    onKeyDown={cycleWorkbookDialogFocus}
    onCancel={event => { event.preventDefault(); void configure('close') }}>
    <h2 id={title}>{i18n._(colorLabels.title)}</h2>
    <p>{i18n._(colorLabels.hint)}</p>
    <form onSubmit={event => { event.preventDefault(); void configure('apply') }}>
      <label>
        <input type="checkbox" checked={panel.hasHeader} disabled={panel.busy}
          onChange={event => void configure({ type: 'header', value: event.currentTarget.checked })} />
        {i18n._(labels.header)}
      </label>
      {panel.keys.map((_, index) => <ColorSortLevelFields key={index} index={index} />)}
      <button type="button" disabled={panel.busy || panel.keys.length === 8}
        onClick={() => void configure('add')}>{i18n._(labels.add)}</button>
      {panel.error && <p role="alert" className="list-sort-error">
        {i18n._(panel.error === 'failed' ? labels.failed : colorLabels[panel.error])}
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
