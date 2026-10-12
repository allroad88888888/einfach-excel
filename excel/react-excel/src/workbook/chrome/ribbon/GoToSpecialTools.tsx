import { useAtomValue, useSetAtom } from '@einfach/react'
import { useEffect, useId, useRef } from 'react'
import { goToSpecialAvailableAtom, goToSpecialPanelAtom, runGoToSpecialAtom } from '@einfach/spreadsheet-ui-core'
import { cycleDialogFocus } from './dialog-focus'
import './go-to.css'

/** 三种条件共享一个原生查询命令；组件只负责选项、提示与 DOM 焦点。 */
export function GoToSpecialTools() {
  const panel = useAtomValue(goToSpecialPanelAtom)
  const available = useAtomValue(goToSpecialAvailableAtom)
  const run = useSetAtom(runGoToSpecialAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const firstRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    if (!panel.open || !dialog) return
    const button = buttonRef.current
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    firstRef.current?.focus()
    return () => {
      dialog.close?.()
      const grid = button?.closest('.workbook')?.querySelector<HTMLElement>('[data-workbook-grid="true"]')
      ;(grid ?? button)?.focus({ preventScroll: true })
    }
  }, [panel.open])
  return <>
    <button ref={buttonRef} type="button" className="tool-button" aria-label="Go to special"
      title="Select constants, formulas or blanks" disabled={!available} onClick={() => void run('open')}>
      <span aria-hidden="true">⌖</span>
    </button>
    {panel.notice && <span role="status" className="visually-hidden">{panel.notice}</span>}
    {panel.open && <dialog ref={dialogRef} className="go-to-dialog" aria-labelledby={`${id}-title`}
      aria-busy={panel.busy} onKeyDown={cycleDialogFocus}
      onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}>Go to special</h2>
      <p className="go-to-hint">{panel.scope}</p>
      <p className="go-to-hint">Includes hidden cells. Merged cells are selected as a whole.</p>
      <div className="go-to-special-options" role="group" aria-label="Select cells by condition">
        <button ref={firstRef} disabled={!available || !panel.continuous} onClick={() => void run('constants')}>Constants</button>
        <button disabled={!available || !panel.continuous} onClick={() => void run('formulas')}>Formulas</button>
        <button disabled={!available || !panel.continuous} onClick={() => void run('blanks')}>Blanks</button>
      </div>
      {!panel.continuous && <p role="alert" className="go-to-error">Select one continuous range before using Go to special.</p>}
      {panel.busy && <p role="status">Locating cells…</p>}
      {panel.error && <p role="alert" className="go-to-error">{panel.error}</p>}
      <div className="go-to-actions"><button type="button" onClick={() => void run('close')}>Cancel</button></div>
    </dialog>}
  </>
}
