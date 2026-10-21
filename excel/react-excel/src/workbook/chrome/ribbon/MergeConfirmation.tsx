import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { runSelectionMergeAtom, selectionMergeFeedbackAtom } from '@einfach/spreadsheet-ui-core'
import { useEffect, useRef, type RefObject } from 'react'
import { cycleDialogFocus } from './dialog-focus'

/** 沿用工作表确认框的原生模态布局，默认先聚焦取消。 */
export function MergeConfirmation({
  openerRef,
}: {
  readonly openerRef: RefObject<HTMLSelectElement>
}) {
  const { t } = useLingui()
  const state = useAtomValue(selectionMergeFeedbackAtom)
  const run = useSetAtom(runSelectionMergeAtom)
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!state.pending || !dialog) return
    const opener = openerRef.current
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      dialog.close?.()
      // 合并菜单在等待确认时禁用，不能依赖浏览器记住原焦点。
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [state.pending, openerRef])
  if (!state.pending) return null
  return (
    <dialog
      ref={ref}
      className="sheet-delete-dialog"
      role="alertdialog"
      aria-labelledby="merge-confirm-title"
      aria-describedby="merge-confirm-description"
      onKeyDown={cycleDialogFocus}
      onCancel={(event) => {
        event.preventDefault()
        if (!state.busy) void run('cancel')
      }}
    >
      <h2 id="merge-confirm-title"><Trans>Merge these cells?</Trans></h2>
      <p id="merge-confirm-description"><Trans>
        Only the upper-left cell's content will remain. Other cell contents will be deleted. Undo
        can restore them.
      </Trans></p>
      <div className="sheet-delete-actions">
        <button type="button" disabled={state.busy} onClick={() => void run('cancel')}><Trans>
          Cancel
        </Trans></button>
        <button type="button" disabled={state.busy} onClick={() => void run('confirm')}>
          {state.busy ? t`Merging…` : t`Merge cells`}
        </button>
      </div>
    </dialog>
  )
}
