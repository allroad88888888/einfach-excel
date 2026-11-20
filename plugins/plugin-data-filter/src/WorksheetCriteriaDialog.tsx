import { useEffect, useId, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { cycleWorkbookDialogFocus, translateWorkbookFeedback } from '@einfach-excel/react-excel'
import { configureWorksheetCriteriaAtom, worksheetCriteriaPanelAtom } from './core/worksheet-criteria'
import { WorksheetCriteriaFields } from './WorksheetCriteriaFields'
import { WorksheetCriteriaPreview } from './WorksheetCriteriaPreview'
import { criteriaLabels } from './worksheet-criteria-messages'
import './worksheet-criteria.css'

export function WorksheetCriteriaDialog() {
  const { i18n } = useLingui()
  const panel = useAtomValue(worksheetCriteriaPanelAtom)
  const configure = useSetAtom(configureWorksheetCriteriaAtom)
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
  const submit = panel.mode === 'in-place' ? criteriaLabels.apply
    : panel.preview ? criteriaLabels.commit : criteriaLabels.preview
  const needsConfirmation = Boolean(panel.preview?.overwrittenCells) && !panel.confirmOverwrite
  return <dialog ref={ref} className="worksheet-criteria-dialog" aria-labelledby={title}
    onKeyDown={cycleWorkbookDialogFocus}
    onCancel={event => { event.preventDefault(); void configure('close') }}>
    <h2 id={title}>{i18n._(criteriaLabels.title)}</h2>
    <form onSubmit={event => { event.preventDefault(); void configure('submit') }}>
      <WorksheetCriteriaFields />
      <WorksheetCriteriaPreview />
      {panel.error && <p role="alert">{translateWorkbookFeedback(i18n, panel.error)}</p>}
      {panel.busy && <p role="status">{i18n._(criteriaLabels.working)}</p>}
      <div className="worksheet-criteria-actions">
        <button type="submit" disabled={panel.busy || needsConfirmation}>{i18n._(submit)}</button>
        <button type="button" disabled={panel.busy} onClick={() => void configure('close')}>
          {i18n._(criteriaLabels.cancel)}
        </button>
      </div>
    </form>
  </dialog>
}
