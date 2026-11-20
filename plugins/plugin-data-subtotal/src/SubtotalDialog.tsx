import { useEffect, useId, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { cycleWorkbookDialogFocus, translateWorkbookFeedback } from '@einfach-excel/react-excel'
import { configureSubtotalAtom, subtotalPanelAtom } from './core'
import { SubtotalFields } from './SubtotalFields'
import { subtotalErrors, subtotalLabels as labels } from './messages'
import './subtotal.css'

export function SubtotalDialog() {
  const { i18n } = useLingui()
  const panel = useAtomValue(subtotalPanelAtom)
  const configure = useSetAtom(configureSubtotalAtom)
  const ref = useRef<HTMLDialogElement>(null)
  const title = useId()
  const open = panel !== null
  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      dialog.close?.()
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [open])
  if (!panel) return null
  const feedback = panel.error && subtotalErrors.find(label => label.message === panel.error)
  const canApply = !panel.busy && !!panel.list?.fields.length && panel.draft.columns.length > 0
  return <dialog ref={ref} className="subtotal-dialog" aria-labelledby={title}
    onKeyDown={cycleWorkbookDialogFocus}
    onCancel={event => { event.preventDefault(); void configure('close') }}>
    <h2 id={title}>{i18n._(labels.title)}</h2>
    <form onSubmit={event => {
      event.preventDefault()
      if (canApply) void configure({
        totalSuffix: i18n._(labels.suffix), grandTotal: i18n._(labels.grand),
      })
    }}>
      <SubtotalFields />
      {panel.error && <p role="alert">
        {feedback ? i18n._(feedback) : translateWorkbookFeedback(i18n, panel.error)}
      </p>}
      {panel.busy && <p role="status">{i18n._(labels.working)}</p>}
      <div className="subtotal-actions">
        {panel.error && <button type="button" onClick={() => void configure('refresh')} disabled={panel.busy}>
          {i18n._(labels.refresh)}
        </button>}
        {panel.list?.placement && <button type="button" disabled={panel.busy}
          onClick={() => void configure('remove')}>{i18n._(labels.remove)}</button>}
        <button type="submit" disabled={!canApply}>{i18n._(labels.apply)}</button>
        <button type="button" onClick={() => void configure('close')}>
          {i18n._(labels.cancel)}
        </button>
      </div>
    </form>
  </dialog>
}
