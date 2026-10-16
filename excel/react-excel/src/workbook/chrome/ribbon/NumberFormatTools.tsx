import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom, numberFormatPanelAtom, runNumberFormatPanelAtom,
  NUMBER_FORMAT_TIME_PATTERNS, NUMBER_FORMAT_DATE_PATTERNS, NUMBER_FORMAT_FRACTIONS,
} from '@einfach/spreadsheet-ui-core'
import { useId, useLayoutEffect, useRef } from 'react'
import { cycleDialogFocus } from './dialog-focus'
import './number-format.css'

/** 数字格式表单只渲染 UI Core 草稿；关闭时把键盘焦点还给入口。 */
export function NumberFormatTools() {
  const { i18n, t } = useLingui()
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
    <button ref={trigger} type="button" className="tool-button" aria-label={t`Number format settings`}
      title={t`Number format settings`} disabled={editing || state.busy}
      onClick={() => void run('open')}>0.0</button>
    {open && <dialog ref={dialogRef} className="number-format-dialog" aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`} onKeyDown={cycleDialogFocus}
      onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}><Trans>Number format</Trans></h2>
      <p id={`${id}-hint`}><Trans>Settings start from the active cell. Apply changes only the number format of the selection.</Trans></p>
      <form noValidate onSubmit={(event) => { event.preventDefault(); void run('apply') }}>
        <label htmlFor={`${id}-category`}><Trans>Category</Trans></label>
        <select id={`${id}-category`} aria-label={t`Number format category`} disabled={state.busy}
          value={state.draft.category} onChange={(event) => void run({ type: 'draft', patch: {
            category: event.currentTarget.value as typeof state.draft.category,
          } })}>
          <option value="number"><Trans>Number</Trans></option><option value="percent"><Trans>Percentage</Trans></option>
          <option value="currency"><Trans>Currency</Trans></option>
          <option value="scientific"><Trans>Scientific</Trans></option><option value="fraction"><Trans>Fraction</Trans></option>
          <option value="time"><Trans>Time</Trans></option><option value="date"><Trans>Date</Trans></option>
          <option value="text"><Trans>Text</Trans></option>
        </select>
        {['number', 'percent', 'currency', 'scientific'].includes(state.draft.category) && <>
        <label htmlFor={`${id}-digits`}><Trans>Decimal places</Trans></label>
        <input id={`${id}-digits`} type="number" min="0" max="15" step="1" disabled={state.busy}
          value={state.draft.digits} aria-describedby={state.error ? `${id}-error` : undefined}
          onChange={(event) => void run({ type: 'draft', patch: { digits: event.currentTarget.value } })} />
        </>}
        {state.draft.category === 'date' && <>
          <label className="number-format-wide" htmlFor={`${id}-date`}><Trans>Date style</Trans></label>
          <select className="number-format-wide" id={`${id}-date`}
            disabled={state.busy} value={state.draft.datePattern}
            onChange={(event) => void run({ type: 'draft', patch: { datePattern: event.currentTarget.value } })}>
            {NUMBER_FORMAT_DATE_PATTERNS.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
            {!NUMBER_FORMAT_DATE_PATTERNS.some((value) => value === state.draft.datePattern) &&
              <option value={state.draft.datePattern} disabled><Trans>
                Unsupported: {state.draft.datePattern}
              </Trans></option>}
          </select>
          <p className="number-format-hint"><Trans>Changes the display only. The original date value stays unchanged.</Trans></p>
        </>}
        {state.draft.category === 'text' && <p className="number-format-hint"><Trans>
          New typing and external paste stay as text, including leading zeros and formulas.
          Existing values and formulas are not converted.
        </Trans></p>}
        {state.draft.category === 'fraction' && <>
          <label htmlFor={`${id}-denominator`}><Trans>Denominator</Trans></label>
          <select id={`${id}-denominator`} disabled={state.busy} value={state.draft.denominator}
            onChange={(event) => void run({ type: 'draft', patch: { denominator: event.currentTarget.value } })}>
            {NUMBER_FORMAT_FRACTIONS.map((value) => <option key={value} value={value}>
              {value === 'one-digit' ? t`Up to 1 digit` : value === 'two-digit' ? t`Up to 2 digits`
                : value === 'three-digit' ? t`Up to 3 digits` : t`Fixed: ${value}`}
            </option>)}
            {!NUMBER_FORMAT_FRACTIONS.some((value) => value === state.draft.denominator) &&
              <option value={state.draft.denominator}>
                <Trans>Fixed: {state.draft.denominator}</Trans></option>}
          </select>
        </>}
        {state.draft.category === 'time' && <>
          <label htmlFor={`${id}-pattern`}><Trans>Time format</Trans></label>
          <select id={`${id}-pattern`} disabled={state.busy} value={state.draft.pattern}
            onChange={(event) => void run({
              type: 'draft', patch: { pattern: event.currentTarget.value },
            })}>
            {NUMBER_FORMAT_TIME_PATTERNS.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
            {!NUMBER_FORMAT_TIME_PATTERNS.some((value) => value === state.draft.pattern) &&
              <option value={state.draft.pattern} disabled><Trans>
                Unsupported: {state.draft.pattern}
              </Trans></option>}
          </select>
          <p className="number-format-hint"><Trans>1 = one day. [h] shows total hours; other styles repeat every 24 hours.</Trans></p>
        </>}
        {state.draft.category === 'number' && <label className="number-format-check">
          <input type="checkbox" checked={state.draft.thousands} disabled={state.busy}
            onChange={(event) => void run({ type: 'draft', patch: { thousands: event.currentTarget.checked } })} /><Trans>
          Use thousands separator
        </Trans></label>}
        {state.draft.category === 'currency' && <>
          <label htmlFor={`${id}-symbol`}><Trans>Currency symbol</Trans></label>
          <input id={`${id}-symbol`} type="text" maxLength={16} disabled={state.busy}
            value={state.draft.symbol} aria-describedby={`${id}-symbol-hint`}
            onChange={(event) => void run({ type: 'draft', patch: { symbol: event.currentTarget.value } })} />
          <p id={`${id}-symbol-hint`} className="number-format-hint"><Trans>For example $, €, ¥ or USD. Leave blank for no symbol.</Trans></p>
        </>}
        <div className="number-format-preview">
          <span><Trans>Preview · {state.target?.addr}</Trans></span>
          <div role="status" aria-label={t`Number format preview`} aria-busy={state.preview === null}>
            {state.preview === null ? t`Loading preview…` : 'text' in state.preview
              ? state.preview.text || t`(Empty)` : translateFeedback(i18n, state.preview.error)}
          </div>
        </div>
        <div className="number-format-actions">
          <button type="button" disabled={state.busy} onClick={() => void run('close')}><Trans>Cancel</Trans></button>
          <button type="submit" disabled={state.busy}><Trans>Apply number format</Trans></button>
        </div>
      </form>
      {state.error && <p id={`${id}-error`} role="alert">{translateFeedback(i18n, state.error)}</p>}
      {state.busy && <p role="status"><Trans>Applying number format…</Trans></p>}
    </dialog>}
  </>
}
