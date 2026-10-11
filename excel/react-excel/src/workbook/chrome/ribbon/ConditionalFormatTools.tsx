import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId, useLayoutEffect, useRef } from 'react'
import { nativeConditionalFormatPanelAtom, nativeConditionalFormatsAtom,
  runNativeConditionalFormatAtom,
  editingSessionAtom, conditionalFormatScopeToA1, type CellValueRule, type ConditionalFormatRule,
  type NativeConditionalFormatRule } from '@einfach/spreadsheet-ui-core'
import { cycleDialogFocus } from './dialog-focus'
import './conditional-format-panel.css'

const OPERATORS = {
  gt: 'Greater than', lt: 'Less than', eq: 'Equal to', ne: 'Not equal to',
  gte: 'At least', lte: 'At most', between: 'Between', 'not-between': 'Not between',
}

function supported(rule: ConditionalFormatRule): rule is NativeConditionalFormatRule {
  return ['cell-value', 'formula', 'top-bottom', 'color-scale', 'data-bar'].includes(rule.kind)
}

function ruleLabel(rule: ConditionalFormatRule): string {
  if (rule.kind === 'cell-value')
    return `${OPERATORS[rule.operator] ?? rule.operator} ${rule.value}${rule.value2 ? ` – ${rule.value2}` : ''}`
  if (rule.kind === 'formula') return rule.formula
  if (rule.kind === 'top-bottom') return `${rule.direction === 'top' ? 'Top' : 'Bottom'} ${rule.count}${rule.percent ? '%' : ' items'}`
  if (rule.kind === 'color-scale') return rule.midColor ? '3-color scale' : '2-color scale'
  if (rule.kind === 'data-bar') return 'Data bar'
  return 'Unsupported rule (not editable yet)'
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
  const between = state.rule.kind === 'cell-value' && (state.rule.operator === 'between' || state.rule.operator === 'not-between')
  const highlight = 'format' in state.rule ? state.rule.format : null
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
      <p id={`${id}-hint`}>Highlight values with conditions, color scales or data bars. Higher rules win when colors overlap.</p>
      <section aria-label="Worksheet rules">
        <h3>Worksheet rules</h3>
        {!config?.rules.length && <p>No rules yet.</p>}
        <ul>{config?.rules.map((entry, index) => <li key={entry.id}>
          <span>{conditionalFormatScopeToA1(entry.scope)} · {ruleLabel(entry.rule)}
            {supported(entry.rule) && entry.rule.enabled === false && ' · Disabled'}</span>
          <div className="conditional-rule-actions">
          <button type="button" disabled={state.busy || !supported(entry.rule)}
            aria-label={`Edit rule ${index + 1}`} onClick={() => void run({ type: 'edit', id: entry.id })}>Edit</button>
          <button type="button" disabled={state.busy || !supported(entry.rule)}
            aria-label={`Copy rule ${index + 1}`}
            onClick={() => void run({ type: 'duplicate', id: entry.id })}>Copy</button>
          <button type="button" disabled={state.busy || !supported(entry.rule)}
            aria-label={`${supported(entry.rule) && entry.rule.enabled === false ? 'Enable' : 'Disable'} rule ${index + 1}`}
            onClick={() => void run({ type: supported(entry.rule) && entry.rule.enabled === false
              ? 'enable' : 'disable', id: entry.id })}>
            {supported(entry.rule) && entry.rule.enabled === false ? 'Enable' : 'Disable'}</button>
          <button type="button" disabled={state.busy || index === 0}
            aria-label={`Move rule ${index + 1} up`}
            onClick={() => void run({ type: 'move-up', id: entry.id })}>↑</button>
          <button type="button" disabled={state.busy || index === (config?.rules.length ?? 0) - 1}
            aria-label={`Move rule ${index + 1} down`}
            onClick={() => void run({ type: 'move-down', id: entry.id })}>↓</button>
          <button type="button" disabled={state.busy} aria-label={`Delete rule ${index + 1}`}
            onClick={() => void run({ type: 'remove', id: entry.id })}>Delete</button>
          </div>
        </li>)}</ul>
        <button type="button" disabled={state.busy} onClick={() => void run('new')}>New rule</button>
      </section>
      <form noValidate onSubmit={(event) => { event.preventDefault(); void run('save') }}>
        <h3>{state.ruleId ? 'Edit rule' : 'New rule'}</h3>
        <fieldset disabled={state.busy}>
          <label htmlFor={`${id}-range`}>Applies to</label>
          <input id={`${id}-range`} value={state.range} spellCheck={false}
            placeholder="A1:A10, C1:C10"
            onChange={(event) => void run({ type: 'draft', range: event.currentTarget.value })} />
          <label htmlFor={`${id}-kind`}>Rule type</label>
          <select id={`${id}-kind`} value={state.rule.kind}
            onChange={(event) => void run({ type: 'kind', kind: event.currentTarget.value as NativeConditionalFormatRule['kind'] })}>
            <option value="cell-value">Cell value</option>
            <option value="formula">Formula</option>
            <option value="top-bottom">Top / bottom</option>
            <option value="color-scale">Color scale</option>
            <option value="data-bar">Data bar</option>
          </select>
          {state.rule.kind === 'cell-value' && <>
          <label htmlFor={`${id}-operator`}>Condition</label>
          <select id={`${id}-operator`} value={state.rule.operator}
            onChange={(event) => void run({ type: 'draft', rule: {
              operator: event.currentTarget.value as CellValueRule['operator'],
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
          </>}
          {state.rule.kind === 'formula' && <>
            <label htmlFor={`${id}-formula`}>Formula</label>
            <input id={`${id}-formula`} value={state.rule.formula} spellCheck={false}
              aria-describedby={`${id}-formula-hint`} placeholder="=$A1>10"
              onChange={(event) => void run({ type: 'draft', rule: { formula: event.currentTarget.value } })} />
            <p id={`${id}-formula-hint`}>Use commas between ranges. Write the formula for the first range’s top-left cell. Use $ to lock a row or column.</p>
          </>}
          {state.rule.kind === 'top-bottom' && <>
            <label htmlFor={`${id}-direction`}>Rank direction</label>
            <select id={`${id}-direction`} value={state.rule.direction}
              onChange={(event) => void run({ type: 'draft', rule: { direction: event.currentTarget.value === 'bottom' ? 'bottom' : 'top' } })}>
              <option value="top">Top</option><option value="bottom">Bottom</option>
            </select>
            <label htmlFor={`${id}-unit`}>Rank by</label>
            <select id={`${id}-unit`} value={state.rule.percent ? 'percent' : 'items'}
              onChange={(event) => void run({ type: 'draft', rule: { percent: event.currentTarget.value === 'percent' } })}>
              <option value="items">Items</option><option value="percent">Percentage</option>
            </select>
            <label htmlFor={`${id}-count`}>{state.rule.percent ? 'Percentage' : 'Number of items'}</label>
            <input id={`${id}-count`} type="number" min={state.rule.percent ? 0 : 1} max={state.rule.percent ? 100 : 1000} step="1"
              value={Number.isNaN(state.rule.count) ? '' : state.rule.count}
              onChange={(event) => void run({ type: 'draft', rule: { count: event.currentTarget.valueAsNumber } })} />
          </>}
          {(state.rule.kind === 'color-scale' || state.rule.kind === 'data-bar') && <>
            {state.rule.kind === 'color-scale' && <>
              <label htmlFor={`${id}-scale-count`}>Scale colors</label>
              <select id={`${id}-scale-count`} value={state.rule.midColor ? '3' : '2'}
                onChange={(event) => void run({ type: 'draft', rule: {
                  midColor: event.currentTarget.value === '3' ? '#ffeb84' : undefined,
                } })}>
                <option value="2">2 colors</option><option value="3">3 colors</option>
              </select>
            </>}
            <label htmlFor={`${id}-low-color`}>{state.rule.kind === 'color-scale' ? 'Minimum color' : 'Negative bar color'}</label>
            <input id={`${id}-low-color`} type="color" value={state.rule.minColor ?? '#f8696b'}
              onChange={(event) => void run({ type: 'draft', rule: { minColor: event.currentTarget.value } })} />
            {state.rule.kind === 'color-scale' && state.rule.midColor && <>
              <label htmlFor={`${id}-mid-color`}>Midpoint color</label>
              <input id={`${id}-mid-color`} type="color" value={state.rule.midColor}
                onChange={(event) => void run({ type: 'draft', rule: { midColor: event.currentTarget.value } })} />
            </>}
            <label htmlFor={`${id}-high-color`}>{state.rule.kind === 'color-scale' ? 'Maximum color' : 'Positive bar color'}</label>
            <input id={`${id}-high-color`} type="color" value={state.rule.maxColor ?? '#638ec6'}
              onChange={(event) => void run({ type: 'draft', rule: { maxColor: event.currentTarget.value } })} />
            <p>{state.rule.kind === 'data-bar'
              ? 'Bars use the full range and a shared zero axis. Negative values extend left; cell values stay visible.'
              : 'Colors use the full range minimum and maximum. The third color marks the median (50th percentile).'}</p>
          </>}
          {highlight && <>
          <label htmlFor={`${id}-fill`}>Highlight fill</label>
          <input id={`${id}-fill`} type="color" value={highlight.bgColor ?? '#ffc7ce'}
            onChange={(event) => void run({ type: 'draft', rule: {
              format: { ...highlight, bgColor: event.currentTarget.value },
            } })} />
          <label htmlFor={`${id}-text`}>Highlight text</label>
          <input id={`${id}-text`} type="color" value={highlight.fgColor ?? '#9c0006'}
            onChange={(event) => void run({ type: 'draft', rule: {
              format: { ...highlight, fgColor: event.currentTarget.value },
            } })} />
          </>}
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
