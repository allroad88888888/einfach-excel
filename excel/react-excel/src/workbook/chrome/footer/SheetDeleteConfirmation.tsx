import { useAtomValue, useSetAtom } from '@einfach/react'
import { runWorkbookSheetCommandAtom, sheetTabsAtom } from '@einfach/spreadsheet-ui-core'
import { useEffect, useRef } from 'react'

/** 删除确认使用原生模态框；确认对象及异步结果仍由 UI Core 持有。 */
export function SheetDeleteConfirmation() {
  const state = useAtomValue(sheetTabsAtom)
  const run = useSetAtom(runWorkbookSheetCommandAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const confirmation = state.deleteConfirmation
  const busy = state.mutation !== null
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !confirmation) return
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => dialog.close?.()
  }, [confirmation])
  if (!confirmation) return null
  return (
    <dialog
      ref={dialogRef}
      className="sheet-delete-dialog"
      role="alertdialog"
      aria-labelledby="sheet-delete-title"
      aria-describedby="sheet-delete-description"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) void run({ operation: 'cancel-delete' })
      }}
    >
      <h2 id="sheet-delete-title">Delete worksheet?</h2>
      <p id="sheet-delete-description">
        Delete “{confirmation.sheetName}” and all its data? This cannot be undone yet.
      </p>
      {state.error && (
        <p className="sheet-command-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="sheet-delete-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run({ operation: 'cancel-delete' })}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          className="sheet-delete-confirm"
          onClick={() => void run({ operation: 'delete' })}
        >
          {busy ? 'Deleting…' : 'Delete worksheet'}
        </button>
      </div>
    </dialog>
  )
}
