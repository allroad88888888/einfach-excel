import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { runWorkbookSheetCommandAtom, sheetTabsAtom } from '@einfach-excel/spreadsheet-ui-core'
import { useEffect, useId, useRef } from 'react'
import { cycleDialogFocus } from '../ribbon/dialog-focus'

/** 删除确认使用原生模态框；确认对象及异步结果仍由 UI Core 持有。 */
export function SheetDeleteConfirmation() {
  const { i18n, t } = useLingui()
  const titleId = useId()
  const descriptionId = useId()
  const state = useAtomValue(sheetTabsAtom)
  const run = useSetAtom(runWorkbookSheetCommandAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const confirmation = state.deleteConfirmation
  const busy = state.mutation !== null
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !confirmation) return
    const previousFocus = dialog.ownerDocument.activeElement
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      dialog.close?.()
      // 条件渲染先移除了 dialog，浏览器不再自动还原焦点；只恢复原 DOM 目标。
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true })
    }
  }, [confirmation])
  if (!confirmation) return null
  return (
    <dialog
      ref={dialogRef}
      className="sheet-delete-dialog"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={cycleDialogFocus}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) void run({ operation: 'cancel-delete' })
      }}
    >
      <h2 id={titleId}><Trans>Delete worksheet?</Trans></h2>
      <p id={descriptionId}><Trans>
        Delete “{confirmation.sheetName}” and all its data? Undo is available within session history
        limits.
      </Trans></p>
      {state.error && (
        <p className="sheet-command-error" role="alert">
          {translateFeedback(i18n, state.error)}
        </p>
      )}
      <div className="sheet-delete-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run({ operation: 'cancel-delete' })}
        ><Trans>
          Cancel
        </Trans></button>
        <button
          type="button"
          disabled={busy}
          className="sheet-delete-confirm"
          onClick={() => void run({ operation: 'delete' })}
        >
          {busy ? t`Deleting…` : t`Delete worksheet`}
        </button>
      </div>
    </dialog>
  )
}
