import { useAtomValue, useSetAtom } from '@einfach/react'
import { runSelectionMergeAtom, selectionMergeFeedbackAtom } from '@einfach/spreadsheet-ui-core'
import { useEffect, useRef } from 'react'

/** 沿用工作表确认框的原生模态布局，默认先聚焦取消。 */
export function MergeConfirmation() {
  const state = useAtomValue(selectionMergeFeedbackAtom)
  const run = useSetAtom(runSelectionMergeAtom)
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!state.pending || !dialog) return
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => dialog.close?.()
  }, [state.pending])
  if (!state.pending) return null
  return (
    <dialog
      ref={ref}
      className="sheet-delete-dialog"
      role="alertdialog"
      aria-labelledby="merge-confirm-title"
      aria-describedby="merge-confirm-description"
      onCancel={(event) => {
        event.preventDefault()
        if (!state.busy) void run('cancel')
      }}
    >
      <h2 id="merge-confirm-title">Merge these cells?</h2>
      <p id="merge-confirm-description">
        Only the upper-left cell's content will remain. Other cell contents will be deleted. Undo
        can restore them.
      </p>
      <div className="sheet-delete-actions">
        <button type="button" disabled={state.busy} onClick={() => void run('cancel')}>
          Cancel
        </button>
        <button type="button" disabled={state.busy} onClick={() => void run('confirm')}>
          {state.busy ? 'Merging…' : 'Merge cells'}
        </button>
      </div>
    </dialog>
  )
}
