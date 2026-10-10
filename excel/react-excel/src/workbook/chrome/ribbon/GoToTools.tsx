import { useAtomValue, useSetAtom } from '@einfach/react'
import { useEffect, useId, useRef } from 'react'
import {
  goToErrorMessageAtom, goToHistoryAtom, goToInputAtom, goToOpenAtom,
  goToReferenceAvailableAtom, runGoToReferenceAtom,
} from '@einfach/spreadsheet-ui-core'
import { cycleDialogFocus } from './dialog-focus'
import './go-to.css'

/** 控件只读定位 atoms；只在这里处理浏览器弹窗与焦点。 */
export function GoToTools() {
  const open = useAtomValue(goToOpenAtom)
  const input = useAtomValue(goToInputAtom)
  const error = useAtomValue(goToErrorMessageAtom)
  const history = useAtomValue(goToHistoryAtom)
  const available = useAtomValue(goToReferenceAvailableAtom)
  const run = useSetAtom(runGoToReferenceAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    const button = buttonRef.current
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    inputRef.current?.focus()
    inputRef.current?.select()
    return () => {
      dialog.close?.()
      const grid = button?.closest('.workbook')
        ?.querySelector<HTMLElement>('[data-workbook-grid="true"]')
      ;(grid ?? button)?.focus({ preventScroll: true })
    }
  }, [open])
  return <>
    <button ref={buttonRef} type="button" className="tool-button" aria-label="Go to"
      title="Go to (Ctrl/⌘+G or F5)" disabled={!available} onClick={() => run('open')}>
      <span aria-hidden="true">↗</span>
    </button>
    {open && <dialog ref={dialogRef} className="go-to-dialog" aria-labelledby={`${id}-title`}
      onKeyDown={cycleDialogFocus} onCancel={(event) => { event.preventDefault(); run('close') }}>
      <h2 id={`${id}-title`}>Go to</h2>
      <form onSubmit={(event) => { event.preventDefault(); run('submit') }}>
        <label htmlFor={`${id}-reference`}>Reference</label>
        <input ref={inputRef} id={`${id}-reference`} value={input} maxLength={1024}
          autoComplete="off" spellCheck={false} disabled={!available}
          aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229))
              event.preventDefault()
          }}
          onChange={(event) => run({ input: event.currentTarget.value })} />
        <p id={`${id}-hint`} className="go-to-hint">
          A1, B2:D10, R12C3, R[2]C[-1], or 'Sales Orders'!B2.
          Hidden rows and columns stay hidden.
        </p>
        <section aria-labelledby={`${id}-recent`}>
          <h3 id={`${id}-recent`}>Recent locations</h3>
          {history.length ? <ul className="go-to-recent">
            {history.map((entry) => <li key={entry}>
              <button type="button" disabled={!available}
                onClick={() => run({ recent: entry })}>{entry}</button>
            </li>)}
          </ul> : <p className="go-to-hint">No recent locations yet.</p>}
        </section>
        {error && <p id={`${id}-error`} className="go-to-error" role="alert">{error}</p>}
        {!available && <p role="status">Finish the current operation before navigating.</p>}
        <div className="go-to-actions">
          <button type="button" onClick={() => run('close')}>Cancel</button>
          <button type="submit" className="go-to-primary" disabled={!available || !input.trim()}>Go</button>
        </div>
      </form>
    </dialog>}
  </>
}
