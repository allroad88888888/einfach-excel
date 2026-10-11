import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId, useLayoutEffect, useRef } from 'react'
import { editingSessionAtom, nativeDataValidationPanelAtom, runNativeDataValidationAtom,
  type NativeDataValidationRule } from '@einfach/spreadsheet-ui-core'
import { cycleDialogFocus } from './dialog-focus'
import './data-validation-panel.css'

/** 展示草稿与错误；原生规则没有 React 本地副本。 */
export function DataValidationTools() {
  const state = useAtomValue(nativeDataValidationPanelAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const run = useSetAtom(runNativeDataValidationAtom)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  const open = state.sheetId !== null
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const opener = trigger.current
    if (!open || !dialog) return
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    dialog.querySelector<HTMLInputElement>('input')?.focus()
    return () => { dialog.close?.(); opener?.focus({ preventScroll: true }) }
  }, [open])
  return <>
    <button ref={trigger} type="button" className="tool-button" aria-label="Data validation"
      title="Data validation" disabled={editing || state.busy}
      onClick={() => void run('open')}>✓</button>
    {open && <dialog ref={dialogRef} className="data-validation-panel" aria-labelledby={`${id}-title`}
      onKeyDown={cycleDialogFocus} onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}>Data validation</h2>
      <p>Limit new input in the selected range. Existing values are kept.</p>
      <form onSubmit={(event) => { event.preventDefault(); void run('save') }}>
        <fieldset disabled={state.busy}>
          <label htmlFor={`${id}-range`}>Applies to</label>
          <input id={`${id}-range`} value={state.range} required
            onChange={(event) => void run({ range: event.currentTarget.value })} />
          <label htmlFor={`${id}-kind`}>Allow</label>
          <select id={`${id}-kind`} value={state.kind}
            onChange={(event) => void run({ kind: event.currentTarget.value as NativeDataValidationRule['kind'] })}>
            <option value="whole-number">Whole number</option>
            <option value="decimal">Decimal</option>
            <option value="list">List</option>
          </select>
          {state.kind === 'list' ? <>
            <label htmlFor={`${id}-items`}>Items, one per line</label>
            <textarea id={`${id}-items`} value={state.items} rows={5} required
              onChange={(event) => void run({ items: event.currentTarget.value })} />
          </> : <>
            <label htmlFor={`${id}-min`}>Minimum</label>
            <input id={`${id}-min`} type="number" step="any" value={state.min} required
              onChange={(event) => void run({ min: event.currentTarget.value })} />
            <label htmlFor={`${id}-max`}>Maximum</label>
            <input id={`${id}-max`} type="number" step="any" value={state.max} required
              onChange={(event) => void run({ max: event.currentTarget.value })} />
          </>}
          <label htmlFor={`${id}-blank`}>Ignore blank cells</label>
          <input id={`${id}-blank`} type="checkbox" checked={state.ignoreBlank}
            onChange={(event) => void run({ ignoreBlank: event.currentTarget.checked })} />
        </fieldset>
        {state.error && <p role="alert">{state.error}</p>}
        {state.busy && <p role="status">Working…</p>}
        <div className="data-validation-actions">
          <button type="button" disabled={state.busy} onClick={() => void run('clear')}>Clear validation</button>
          <button type="button" disabled={state.busy} onClick={() => void run('close')}>Cancel</button>
          <button type="submit" disabled={state.busy}>Apply</button>
        </div>
      </form>
    </dialog>}
  </>
}
