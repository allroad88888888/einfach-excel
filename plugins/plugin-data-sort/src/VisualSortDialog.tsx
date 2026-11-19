import { useEffect, useId, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { cycleWorkbookDialogFocus, translateWorkbookFeedback } from '@einfach-excel/react-excel'
import { visualSortPanelAtom, configureVisualSortAtom } from './core'
import { VisualSortLevelFields } from './VisualSortLevelFields'
import { HorizontalSortOptions } from './HorizontalSortOptions'
import { colorLabels } from './color-messages'
import { iconLabels } from './icon-messages'
import { horizontalError, horizontalLabels } from './horizontal-messages'
import { labels } from './messages'
import './sort.css'

export function VisualSortDialog() {
  const { i18n } = useLingui()
  const panel = useAtomValue(visualSortPanelAtom)
  const configure = useSetAtom(configureVisualSortAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const title = useId()
  const hint = useId()
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
  const horizontal = panel.entry === 'horizontal'
  const labelsForEntry = horizontal ? horizontalLabels
    : panel.entry === 'icon' ? iconLabels : colorLabels
  const knownError = horizontal ? horizontalError(panel.detail) : undefined
  return <dialog ref={dialogRef} className="list-sort-dialog" aria-labelledby={title}
    aria-describedby={hint}
    onKeyDown={cycleWorkbookDialogFocus}
    onCancel={event => { event.preventDefault(); void configure('close') }}>
    <h2 id={title}>{i18n._(labelsForEntry.title)}</h2>
    <p id={hint}>{i18n._(labelsForEntry.hint)}</p>
    <form onSubmit={event => { event.preventDefault(); void configure('apply') }}>
      {horizontal ? <HorizontalSortOptions /> : <label>
        <input type="checkbox" checked={panel.hasHeader} disabled={panel.busy}
          onChange={event => void configure({ type: 'header', value: event.currentTarget.checked })} />
        {i18n._(labels.header)}
      </label>}
      {panel.keys.map((_, index) => <VisualSortLevelFields key={index} index={index} />)}
      <button type="button" disabled={panel.busy || panel.keys.length === 8}
        onClick={() => void configure('add')}>{i18n._(labels.add)}</button>
      {panel.error && <p role="alert" className="list-sort-error">
        {i18n._(panel.error === 'failed' ? labels.failed : panel.error === 'stale' ? labelsForEntry.stale
          : panel.entry === 'icon' ? iconLabels.chooseIcon : colorLabels.chooseColor)}
        {panel.detail && <span>{knownError ? i18n._(knownError)
          : translateWorkbookFeedback(i18n, panel.detail)}</span>}
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
