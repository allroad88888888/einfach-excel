import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom, numberFormatPanelAtom, runNumberFormatPanelAtom,
  NUMBER_FORMAT_TIME_PATTERNS, NUMBER_FORMAT_FRACTIONS,
} from '@einfach/spreadsheet-ui-core'
import { useId, useLayoutEffect, useRef } from 'react'
import { cycleDialogFocus } from './dialog-focus'
import './number-format.css'

/** 数字格式表单只渲染 UI Core 草稿；关闭时把键盘焦点还给入口。 */
export function NumberFormatTools() {
  const state = useAtomValue(numberFormatPanelAtom)
  const run = useSetAtom(runNumberFormatPanelAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const trigger = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  const open = state.target !== null
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const opener = trigger.current
    if (!open || !dialog) return
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    dialog.querySelector('select')?.focus()
    return () => { dialog.close?.(); opener?.focus({ preventScroll: true }) }
  }, [open])
  return <>
    <button ref={trigger} type="button" className="tool-button" aria-label="Number format settings"
      title="Number format settings" disabled={editing || state.busy}
      onClick={() => void run('open')}>0.0</button>
    {open && <dialog ref={dialogRef} className="number-format-dialog" aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`} onKeyDown={cycleDialogFocus}
      onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}>Number format</h2>
      <p id={`${id}-hint`}>Settings start from the active cell. Apply changes only the number format of the selection.</p>
      <form noValidate onSubmit={(event) => { event.preventDefault(); void run('apply') }}>
        <label htmlFor={`${id}-category`}>Category</label>
        <select id={`${id}-category`} aria-label="Number format category" disabled={state.busy}
          value={state.draft.category} onChange={(event) => void run({ type: 'draft', patch: {
            category: event.currentTarget.value as typeof state.draft.category,
          } })}>
          <option value="number">Number</option><option value="percent">Percentage</option>
          <option value="currency">Currency</option>
          <option value="scientific">Scientific</option><option value="fraction">Fraction</option>
          <option value="time">Time</option>
        </select>
        {state.draft.category !== 'fraction' && state.draft.category !== 'time' && <>
        <label htmlFor={`${id}-digits`}>Decimal places</label>
        <input id={`${id}-digits`} type="number" min="0" max="15" step="1" disabled={state.busy}
          value={state.draft.digits} aria-describedby={state.error ? `${id}-error` : undefined}
          onChange={(event) => void run({ type: 'draft', patch: { digits: event.currentTarget.value } })} />
        </>}
        {state.draft.category === 'fraction' && <>
          <label htmlFor={`${id}-denominator`}>Denominator</label>
          <select id={`${id}-denominator`} disabled={state.busy} value={state.draft.denominator}
            onChange={(event) => void run({ type: 'draft', patch: { denominator: event.currentTarget.value } })}>
            {NUMBER_FORMAT_FRACTIONS.map((value) => <option key={value} value={value}>
              {value.includes('-digit') ? `Up to ${value === 'one-digit' ? '1 digit' : value === 'two-digit' ? '2 digits' : '3 digits'}` : `Fixed: ${value}`}
            </option>)}
            {!NUMBER_FORMAT_FRACTIONS.some((value) => value === state.draft.denominator) &&
              <option value={state.draft.denominator}>Fixed: {state.draft.denominator}</option>}
          </select>
        </>}
        {state.draft.category === 'time' && <>
          <label htmlFor={`${id}-pattern`}>Time format</label>
          <select id={`${id}-pattern`} disabled={state.busy} value={state.draft.pattern}
            onChange={(event) => void run({
              type: 'draft', patch: { pattern: event.currentTarget.value },
            })}>
            {NUMBER_FORMAT_TIME_PATTERNS.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
            {!NUMBER_FORMAT_TIME_PATTERNS.some((value) => value === state.draft.pattern) &&
              <option value={state.draft.pattern} disabled>
                Unsupported: {state.draft.pattern}
              </option>}
          </select>
          <p className="number-format-hint">1 = one day. [h] shows total hours; other styles repeat every 24 hours.</p>
        </>}
        {state.draft.category === 'number' && <label className="number-format-check">
          <input type="checkbox" checked={state.draft.thousands} disabled={state.busy}
            onChange={(event) => void run({ type: 'draft', patch: { thousands: event.currentTarget.checked } })} />
          Use thousands separator
        </label>}
        {state.draft.category === 'currency' && <>
          <label htmlFor={`${id}-symbol`}>Currency symbol</label>
          <input id={`${id}-symbol`} type="text" maxLength={16} disabled={state.busy}
            value={state.draft.symbol} aria-describedby={`${id}-symbol-hint`}
            onChange={(event) => void run({ type: 'draft', patch: { symbol: event.currentTarget.value } })} />
          <p id={`${id}-symbol-hint`} className="number-format-hint">For example $, €, ¥ or USD. Leave blank for no symbol.</p>
        </>}
        <div className="number-format-actions">
          <button type="button" disabled={state.busy} onClick={() => void run('close')}>Cancel</button>
          <button type="submit" disabled={state.busy}>Apply number format</button>
        </div>
      </form>
      {state.error && <p id={`${id}-error`} role="alert">{state.error}</p>}
      {state.busy && <p role="status">Applying number format…</p>}
    </dialog>}
  </>
}
