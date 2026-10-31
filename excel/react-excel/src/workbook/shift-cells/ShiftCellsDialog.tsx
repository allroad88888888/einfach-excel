import { useId, useLayoutEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react/macro'
import {
  SHIFT_CELLS_CHOICES,
  chooseShiftCellsOptionAtom,
  closeShiftCellsDialogAtom,
  confirmShiftCellsAtom,
  shiftCellsDialogAtom,
  type ShiftCellsChoice,
} from '@einfach-excel/spreadsheet-ui-core'
import { cycleDialogFocus } from '../chrome/ribbon/dialog-focus'
import { translateFeedback } from '../../i18n/translate-feedback'
import './shift-cells.css'

/** “插入…”/“删除…”只展示 UI Core 的选择；确认派发唯一的 confirm command atom。 */
export function ShiftCellsDialog() {
  const { t, i18n } = useLingui()
  const state = useAtomValue(shiftCellsDialogAtom)
  const choose = useSetAtom(chooseShiftCellsOptionAtom)
  const close = useSetAtom(closeShiftCellsDialogAtom)
  const confirm = useSetAtom(confirmShiftCellsAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  const open = state.mode !== null
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const grid = dialog.closest('.workbook')?.querySelector<HTMLElement>('[data-workbook-grid="true"]')
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    dialog.querySelector<HTMLInputElement>('input:checked')?.focus()
    return () => {
      dialog.close?.()
      // 右键菜单项随菜单卸载；此时把焦点交还表格，保持键盘可继续操作。
      const target = opener?.isConnected ? opener : grid
      target?.focus({ preventScroll: true })
    }
  }, [open])
  if (state.mode === null) return null
  const labels: Record<ShiftCellsChoice, string> = {
    'shift-right': t`Shift cells right`,
    'shift-down': t`Shift cells down`,
    'shift-left': t`Shift cells left`,
    'shift-up': t`Shift cells up`,
    'entire-row': t`Entire row`,
    'entire-column': t`Entire column`,
  }
  const title = state.mode === 'insert' ? t`Insert` : t`Delete`
  return (
    <dialog
      ref={dialogRef}
      className="shift-cells-dialog"
      aria-labelledby={`${id}-title`}
      onKeyDown={cycleDialogFocus}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void confirm()
        }}
      >
        <fieldset disabled={state.busy}>
          <legend>{title}</legend>
          {SHIFT_CELLS_CHOICES[state.mode].map((choice) => (
            <label key={choice}>
              <input
                type="radio"
                name={`${id}-choice`}
                value={choice}
                checked={state.choice === choice}
                onChange={() => choose(choice)}
              />
              {labels[choice]}
            </label>
          ))}
        </fieldset>
        {state.error && (
          <p className="shift-cells-error" role="alert">
            {translateFeedback(i18n, state.error)}
          </p>
        )}
        <div className="shift-cells-actions">
          <button type="button" disabled={state.busy} onClick={() => close()}>
            {t`Cancel`}
          </button>
          <button type="submit" disabled={state.busy}>
            {t`OK`}
          </button>
        </div>
      </form>
    </dialog>
  )
}
