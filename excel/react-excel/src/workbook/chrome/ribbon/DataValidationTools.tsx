import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId, useLayoutEffect, useRef } from 'react'
import { editingSessionAtom, nativeDataValidationPanelAtom, runNativeDataValidationAtom,
  type NativeDataValidationOperator, type NativeDataValidationRule } from '@einfach/spreadsheet-ui-core'
import { cycleDialogFocus } from './dialog-focus'
import { AdvancedValidationFields } from '../../advanced-validation/AdvancedValidationFields'
import './data-validation-panel.css'

/** 展示草稿与错误；原生规则没有 React 本地副本。 */
export function DataValidationTools() {
  const { i18n, t } = useLingui()
  const state = useAtomValue(nativeDataValidationPanelAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const run = useSetAtom(runNativeDataValidationAtom)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  const open = state.sheetId !== null
  const reading = state.phase === 'reading'
  const temporal = state.kind === 'date' || state.kind === 'time'
  const twoBounds = state.operator === 'between' || state.operator === 'not-between'
  const boundHint = state.kind === 'date' ? 'YYYY-MM-DD' : state.kind === 'time' ? 'HH:mm:ss' : undefined
  const boundHelp = state.kind === 'date' ? t`Use YYYY-MM-DD.`
    : t`Use a clock time from 00:00 to 23:59:59.`
  const inclusiveHelp = state.kind === 'date'
    ? t` Both dates are included.` : t` Both times are included.`
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const opener = trigger.current
    if (!open || !dialog) return
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => { dialog.close?.(); opener?.focus({ preventScroll: true }) }
  }, [open])
  useLayoutEffect(() => {
    if (open && !reading) dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus()
  }, [open, reading])
  return <>
    <button ref={trigger} type="button" className="tool-button" aria-label={t`Data validation`}
      title={t`Data validation`} disabled={editing || state.busy}
      onClick={() => void run('open')}>✓</button>
    {open && <dialog ref={dialogRef} className="data-validation-panel" aria-labelledby={`${id}-title`}
      onKeyDown={cycleDialogFocus} onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}><Trans>Data validation</Trans></h2>
      <p><Trans>Limit new input in the selected range. Existing values are kept.</Trans></p>
      <form onSubmit={(event) => { event.preventDefault(); void run('save') }}>
        <fieldset disabled={state.busy}>
          <label htmlFor={`${id}-range`}><Trans>Applies to</Trans></label>
          <input id={`${id}-range`} value={state.range} required
            onChange={(event) => void run({ range: event.currentTarget.value })} />
          <label htmlFor={`${id}-kind`}><Trans>Allow</Trans></label>
          <select id={`${id}-kind`} value={state.kind}
            onChange={(event) => void run({ kind: event.currentTarget.value as NativeDataValidationRule['kind'] })}>
            <option value="whole-number"><Trans>Whole number</Trans></option>
            <option value="decimal"><Trans>Decimal</Trans></option>
            <option value="list"><Trans>List</Trans></option>
            <option value="date"><Trans>Date</Trans></option>
            <option value="time"><Trans>Time</Trans></option>
            <option value="text-length"><Trans>Text length</Trans></option>
            <option value="custom-formula"><Trans>Custom formula</Trans></option>
          </select>
          {state.kind === 'list' ? <>
            <label htmlFor={`${id}-items`}><Trans>Items, one per line</Trans></label>
            <textarea id={`${id}-items`} value={state.items} rows={5} required
              onChange={(event) => void run({ items: event.currentTarget.value })} />
          </> : state.kind !== 'custom-formula' && <>
            <label htmlFor={`${id}-operator`}><Trans>Condition</Trans></label>
            <select id={`${id}-operator`} value={state.operator}
              onChange={(event) => {
                void run({ operator: event.currentTarget.value as NativeDataValidationOperator })
              }}>
              <option value="between"><Trans>Between</Trans></option>
              <option value="not-between"><Trans>Not between</Trans></option>
              <option value="equal"><Trans>Equal to</Trans></option>
              <option value="not-equal"><Trans>Not equal to</Trans></option>
              <option value="greater-than"><Trans>Greater than</Trans></option>
              <option value="greater-than-or-equal"><Trans>Greater than or equal to</Trans></option>
              <option value="less-than"><Trans>Less than</Trans></option>
              <option value="less-than-or-equal"><Trans>Less than or equal to</Trans></option>
            </select>
            <label htmlFor={`${id}-min`}>{twoBounds ? t`Minimum` : t`Value`}</label>
            <input id={`${id}-min`} type={temporal ? 'text' : 'number'} step="any"
              placeholder={boundHint} aria-describedby={temporal ? `${id}-hint` : undefined}
              value={state.min} required
              onChange={(event) => void run({ min: event.currentTarget.value })} />
            {twoBounds && <><label htmlFor={`${id}-max`}><Trans>Maximum</Trans></label>
            <input id={`${id}-max`} type={temporal ? 'text' : 'number'} step="any"
              placeholder={boundHint} aria-describedby={temporal ? `${id}-hint` : undefined}
              value={state.max} required
              onChange={(event) => void run({ max: event.currentTarget.value })} /></>}
          </>}
          <label htmlFor={`${id}-blank`}><Trans>Ignore blank cells</Trans></label>
          <input id={`${id}-blank`} type="checkbox" checked={state.ignoreBlank}
            onChange={(event) => void run({ ignoreBlank: event.currentTarget.checked })} />
          <AdvancedValidationFields id={id} />
        </fieldset>
        {temporal && <p id={`${id}-hint`}>
          {boundHelp}{state.operator === 'between' ? inclusiveHelp : ''}
        </p>}
        {state.kind !== 'list' && state.kind !== 'custom-formula' && state.operator === 'not-between' &&
          <p><Trans>Values must be below the minimum or above the maximum.
            Both boundaries are excluded.</Trans></p>}
        {state.error && <p role="alert">{translateFeedback(i18n, state.error)}</p>}
        {state.busy && <p role="status">{state.phase === 'saving'
          ? t`Saving validation…` : t`Loading validation…`}</p>}
        <div className="data-validation-actions">
          <button type="button" disabled={state.busy} onClick={() => void run('clear')}><Trans>Clear validation</Trans></button>
          <button type="button" disabled={state.phase === 'saving'} onClick={() => void run('close')}><Trans>Cancel</Trans></button>
          <button type="submit" disabled={state.busy}><Trans>Apply</Trans></button>
        </div>
      </form>
    </dialog>}
  </>
}
