import { useAtomValue, useSetAtom } from '@einfach/react'
import { dismissLockedEditFeedbackAtom, lockedEditFeedbackAtom } from '@einfach-excel/spreadsheet-ui-core'
import { Trans } from '@lingui/react/macro'
import { useEffect, useId, useRef } from 'react'
import { cycleDialogFocus } from '../chrome/ribbon/dialog-focus'
import './locked-cell-dialog.css'

/** Displays an existing edit refusal as a modal warning without moving the grid. */
export function LockedCellDialog() {
  const feedback = useAtomValue(lockedEditFeedbackAtom)
  const dismiss = useSetAtom(dismissLockedEditFeedbackAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !feedback) return
    const document = dialog.ownerDocument
    const previousFocus = document.activeElement
    const grid = dialog.closest('.workbook')
      ?.querySelector<HTMLElement>('[data-workbook-grid]')
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    buttonRef.current?.focus({ preventScroll: true })
    return () => {
      dialog.close?.()
      const active = document.activeElement
      // 仅恢复本工作簿焦点；宿主已移走焦点时不抢回。
      if (grid?.isConnected && (active === document.body || active === previousFocus ||
        (active !== null && dialog.contains(active)))) grid.focus({ preventScroll: true })
    }
  }, [feedback])
  if (!feedback) return null
  return (
    <dialog
      ref={dialogRef}
      className="locked-cell-dialog"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={cycleDialogFocus}
      onCancel={(event) => {
        event.preventDefault()
        dismiss(feedback)
      }}
    >
      <div className="locked-cell-dialog-message">
        <svg className="locked-cell-dialog-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 22 21H2Z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" />
          <path d="M12 9v5m0 3v.2" fill="none" stroke="#573a09" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <div>
          <h2 id={titleId}><Trans>This worksheet is protected.</Trans></h2>
          <p id={descriptionId}><Trans>To edit this cell, unprotect the worksheet first.</Trans></p>
        </div>
      </div>
      <div className="locked-cell-dialog-actions">
        <button ref={buttonRef} type="button" onClick={() => dismiss(feedback)}>
          <Trans>OK</Trans>
        </button>
      </div>
    </dialog>
  )
}
