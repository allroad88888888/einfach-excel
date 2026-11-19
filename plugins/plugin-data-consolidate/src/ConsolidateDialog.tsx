import { useEffect, useId, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { cycleWorkbookDialogFocus, translateWorkbookFeedback } from '@einfach-excel/react-excel'
import { ConsolidateFields } from './ConsolidateFields'
import { ConsolidatePreview } from './ConsolidatePreview'
import { configureConsolidateAtom, consolidatePanelAtom } from './core'
import { consolidateErrors, consolidateLabels as labels } from './messages'
import './consolidate.css'

export function ConsolidateDialog() {
  const { i18n } = useLingui()
  const panel = useAtomValue(consolidatePanelAtom)
  const configure = useSetAtom(configureConsolidateAtom)
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
  const feedback = panel.error && consolidateErrors.find((entry) => entry.message === panel.error)
  const hasSources =
    panel.draft.references.length > 0 || panel.draft.referenceInput.trim().length > 0
  const needsConfirmation = Boolean(panel.preview?.overwrittenCells) && !panel.confirmOverwrite
  const canApply = !panel.busy && panel.preview !== null && !needsConfirmation

  return (
    <dialog
      ref={ref}
      className="consolidate-dialog"
      aria-labelledby={title}
      onKeyDown={cycleWorkbookDialogFocus}
      onCancel={(event) => {
        event.preventDefault()
        void configure('close')
      }}
    >
      <h2 id={title}>{i18n._(labels.title)}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (panel.preview) {
            if (canApply) void configure('apply')
          } else if (hasSources && !panel.busy) {
            void configure('preview')
          }
        }}
      >
        <ConsolidateFields />
        <ConsolidatePreview />
        {panel.error && (
          <p role="alert">
            {feedback ? i18n._(feedback) : translateWorkbookFeedback(i18n, panel.error)}
          </p>
        )}
        {panel.busy && <p role="status">{i18n._(labels.working)}</p>}
        <div className="consolidate-actions">
          <button
            type="button"
            disabled={panel.busy || !hasSources}
            onClick={() => void configure('preview')}
          >
            {i18n._(labels.preview)}
          </button>
          <button type="submit" disabled={!canApply}>
            {i18n._(labels.apply)}
          </button>
          <button type="button" onClick={() => void configure('close')}>
            {i18n._(labels.cancel)}
          </button>
        </div>
      </form>
    </dialog>
  )
}
