import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId, useLayoutEffect, useRef } from 'react'
import { nativeConditionalFormatPanelAtom, nativeConditionalFormatsAtom,
  runNativeConditionalFormatAtom,
  editingSessionAtom, rangeToA1 } from '@einfach/spreadsheet-ui-core'
import { cycleDialogFocus } from './dialog-focus'
import './conditional-format-panel.css'

const OPERATORS = {
  gt: 'Greater than', lt: 'Less than', eq: 'Equal to', ne: 'Not equal to',
  gte: 'At least', lte: 'At most', between: 'Between', 'not-between': 'Not between',
}

/** 显示原生规则目录；每个输入只更新 command atom 的未提交草稿。 */
export function ConditionalFormatTools() {
  const state = useAtomValue(nativeConditionalFormatPanelAtom)
  const config = useAtomValue(nativeConditionalFormatsAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const run = useSetAtom(runNativeConditionalFormatAtom)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  const open = state.sheetId !== null
  const between = state.rule.operator === 'between' || state.rule.operator === 'not-between'
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
    <button ref={trigger} type="button" className="tool-button" aria-label="Conditional formatting"
      title="Conditional formatting" disabled={editing || state.busy || !config}
      onClick={() => void run('open')}>◩</button>
    {open && <dialog ref={dialogRef} className="conditional-format-panel" aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`} onKeyDown={cycleDialogFocus}
      onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}>Conditional formatting</h2>
      <p id={`${id}-hint`}>Highlight numeric values. Original cell formatting stays unchanged.</p>
      <section aria-label="Worksheet rules">
        <h3>Worksheet rules</h3>
        {!config?.rules.length && <p>No rules yet.</p>}
        <ul>{config?.rules.map((entry, index) => <li key={entry.id}>
          <span>{rangeToA1(entry.scope.range)} · {entry.rule.kind === 'cell-value'
            ? `${OPERATORS[entry.rule.operator] ?? entry.rule.operator} ${entry.rule.value}${entry.rule.value2 ? ` – ${entry.rule.value2}` : ''}`
            : `${entry.rule.kind} (not editable yet)`}</span>
          <button type="button" disabled={state.busy || entry.rule.kind !== 'cell-value'}
            aria-label={`Edit rule ${index + 1}`} onClick={() => void run({ type: 'edit', id: entry.id })}>Edit</button>
          <button type="button" disabled={state.busy} aria-label={`Delete rule ${index + 1}`}
            onClick={() => void run({ type: 'remove', id: entry.id })}>Delete</button>
        </li>)}</ul>
        <button type="button" disabled={state.busy} onClick={() => void run('new')}>New rule</button>
      </section>
      <form noValidate onSubmit={(event) => { event.preventDefault(); void run('save') }}>
        <h3>{state.ruleId ? 'Edit rule' : 'New rule'}</h3>
        <fieldset disabled={state.busy}>
          <label htmlFor={`${id}-range`}>Applies to</label>
          <input id={`${id}-range`} value={state.range} spellCheck={false}
            onChange={(event) => void run({ type: 'draft', range: event.currentTarget.value })} />
          <label htmlFor={`${id}-operator`}>Condition</label>
          <select id={`${id}-operator`} value={state.rule.operator}
            onChange={(event) => void run({ type: 'draft', rule: {
              operator: event.currentTarget.value as typeof state.rule.operator,
            } })}>
            {Object.entries(OPERATORS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <label htmlFor={`${id}-value`}>{between ? 'Minimum' : 'Value'}</label>
          <input id={`${id}-value`} inputMode="decimal" value={state.rule.value}
            onChange={(event) => void run({ type: 'draft', rule: { value: event.currentTarget.value } })} />
          {between && <>
            <label htmlFor={`${id}-value2`}>Maximum</label>
            <input id={`${id}-value2`} inputMode="decimal" value={state.rule.value2 ?? ''}
              onChange={(event) => void run({ type: 'draft', rule: { value2: event.currentTarget.value } })} />
          </>}
          <label htmlFor={`${id}-fill`}>Highlight fill</label>
          <input id={`${id}-fill`} type="color" value={state.rule.format.bgColor ?? '#ffc7ce'}
            onChange={(event) => void run({ type: 'draft', rule: {
              format: { ...state.rule.format, bgColor: event.currentTarget.value },
            } })} />
          <label htmlFor={`${id}-text`}>Highlight text</label>
          <input id={`${id}-text`} type="color" value={state.rule.format.fgColor ?? '#9c0006'}
            onChange={(event) => void run({ type: 'draft', rule: {
              format: { ...state.rule.format, fgColor: event.currentTarget.value },
            } })} />
        </fieldset>
        {state.error && <p role="alert">{state.error}</p>}
        {state.busy && <p role="status">Saving conditional formatting…</p>}
        <div className="conditional-format-actions">
          <button type="button" disabled={state.busy} onClick={() => void run('close')}>Cancel</button>
          <button type="submit" disabled={state.busy}>{state.ruleId ? 'Save rule' : 'Add rule'}</button>
        </div>
      </form>
    </dialog>}
  </>
}
