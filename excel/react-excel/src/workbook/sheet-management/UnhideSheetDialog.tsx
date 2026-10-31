import { Trans, useLingui } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  chooseUnhideSheetAtom,
  closeUnhideDialogAtom,
  hiddenSheetListAtom,
  sheetManagementUiAtom,
  sheetTabsAtom,
  unhideSheetAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { useEffect, useId, useRef } from 'react'
import { cycleDialogFocus } from '../chrome/ribbon/dialog-focus'
import './sheet-management.css'

/** 取消隐藏：列出隐藏的表，选中一张后由 Rust 恢复显示（一步撤销）。 */
export function UnhideSheetDialog() {
  const { t } = useLingui()
  const titleId = useId()
  const ui = useAtomValue(sheetManagementUiAtom)
  const hidden = useAtomValue(hiddenSheetListAtom)
  const busy = useAtomValue(sheetTabsAtom).mutation !== null
  const choose = useSetAtom(chooseUnhideSheetAtom)
  const close = useSetAtom(closeUnhideDialogAtom)
  const unhide = useSetAtom(unhideSheetAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const open = ui.unhideOpen

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !open) return
    const previousFocus = dialog.ownerDocument.activeElement
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      dialog.close?.()
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true })
    }
  }, [open])

  if (!open) return null
  return (
    <dialog
      ref={dialogRef}
      className="sheet-unhide-dialog"
      aria-labelledby={titleId}
      onKeyDown={cycleDialogFocus}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) void close()
      }}
    >
      <h2 id={titleId}><Trans>Unhide worksheet</Trans></h2>
      <div role="listbox" aria-label={t`Hidden worksheets`} className="sheet-unhide-list">
        {hidden.map((sheet) => (
          <button
            key={sheet.id}
            type="button"
            role="option"
            aria-selected={sheet.id === ui.unhideSelection}
            onClick={() => void choose(sheet.id)}
            onDoubleClick={() => void unhide(sheet.id)}
          >
            {sheet.name}
          </button>
        ))}
      </div>
      <div className="sheet-unhide-actions">
        <button type="button" disabled={busy} onClick={() => void close()}>
          <Trans>Cancel</Trans>
        </button>
        <button
          type="button"
          className="sheet-unhide-confirm"
          disabled={busy || !ui.unhideSelection}
          onClick={() => ui.unhideSelection && void unhide(ui.unhideSelection)}
        >
          <Trans>OK</Trans>
        </button>
      </div>
    </dialog>
  )
}
