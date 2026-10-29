import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId, useLayoutEffect, useRef } from 'react'
import { nativeConditionalFormatPanelAtom, nativeConditionalFormatsAtom,
  runNativeConditionalFormatAtom,
  editingSessionAtom, conditionalFormatScopeToA1, type CellValueRule, type ConditionalFormatRule,
  type NativeConditionalFormatRule } from '@einfach-excel/spreadsheet-ui-core'
import { cycleDialogFocus } from './dialog-focus'
import { AdvancedConditionalFormatFields } from '../../advanced-conditional-format/AdvancedConditionalFormatFields'
import { AdvancedFormattingFields } from '../../advanced-formatting/AdvancedFormattingFields'
import './conditional-format-panel.css'

function supported(rule: ConditionalFormatRule): rule is NativeConditionalFormatRule {
  return ['cell-value', 'formula', 'top-bottom', 'color-scale', 'data-bar', 'text', 'duplicate-values', 'icon-set'].includes(rule.kind)
}

/** 显示原生规则目录；每个输入只更新 command atom 的未提交草稿。 */
export function ConditionalFormatTools() {
  const { i18n, t } = useLingui()
  const OPERATORS = {
    gt: t`Greater than`, lt: t`Less than`, eq: t`Equal to`, ne: t`Not equal to`,
    gte: t`At least`, lte: t`At most`, between: t`Between`, 'not-between': t`Not between`,
  }
  const TEXT_CONDITIONS = {
    contains: t`Contains`, 'not-contains': t`Does not contain`,
    'begins-with': t`Begins with`, 'ends-with': t`Ends with`,
    'matches-wildcard': t`Matches wildcard`, 'not-matches-wildcard': t`Does not match wildcard`,
  }
  function ruleLabel(rule: ConditionalFormatRule): string {
    if (rule.kind === 'text') return `${TEXT_CONDITIONS[rule.condition]} “${rule.text}”`
    if (rule.kind === 'duplicate-values') return rule.mode === 'unique' ? t`Unique values` : t`Duplicate values`
    if (rule.kind === 'cell-value')
      return `${OPERATORS[rule.operator] ?? rule.operator} ${rule.value}${rule.value2 ? ` – ${rule.value2}` : ''}`
    if (rule.kind === 'formula') return rule.formula
    if (rule.kind === 'top-bottom') {
      const count = rule.count
      return rule.direction === 'top'
        ? (rule.percent ? t`Top ${count}%` : t`Top ${count} items`)
        : (rule.percent ? t`Bottom ${count}%` : t`Bottom ${count} items`)
    }
    if (rule.kind === 'color-scale') return rule.midColor ? t`3-color scale` : t`2-color scale`
    if (rule.kind === 'data-bar') return t`Data bar`
    if (rule.kind === 'icon-set') return t`Icon set`
    return t`Unsupported rule (not editable yet)`
  }

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
    <button ref={trigger} type="button" className="tool-button" aria-label={t`Conditional formatting`}
      title={t`Conditional formatting`} disabled={editing || state.busy || !config}
      onClick={() => void run('open')}>◩</button>
    {open && <dialog ref={dialogRef} className="conditional-format-panel" aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`} onKeyDown={cycleDialogFocus}
      onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}><Trans>Conditional formatting</Trans></h2>
      <p id={`${id}-hint`}><Trans>Highlight values with conditions, color scales or data bars. Higher rules win when colors overlap.</Trans></p>
      <section aria-label={t`Worksheet rules`}>
        <h3><Trans>Worksheet rules</Trans></h3>
        {!config?.rules.length && <p><Trans>No rules yet.</Trans></p>}
        <ul>{config?.rules.map((entry, index) => <li key={entry.id}>
          <span>{conditionalFormatScopeToA1(entry.scope)} · {ruleLabel(entry.rule)}
            {'stopIfTrue' in entry.rule && entry.rule.stopIfTrue && t` · Stop if true`}
            {supported(entry.rule) && entry.rule.enabled === false && t` · Disabled`}</span>
          <div className="conditional-rule-actions">
          <button type="button" disabled={state.busy || !supported(entry.rule)}
            aria-label={t`Edit rule ${index + 1}`} onClick={() => void run({ type: 'edit', id: entry.id })}><Trans>Edit</Trans></button>
          <button type="button" disabled={state.busy || !supported(entry.rule)}
            aria-label={t`Copy rule ${index + 1}`}
            onClick={() => void run({ type: 'duplicate', id: entry.id })}><Trans>Copy</Trans></button>
          <button type="button" disabled={state.busy || !supported(entry.rule)}
            aria-label={supported(entry.rule) && entry.rule.enabled === false
              ? t`Enable rule ${index + 1}` : t`Disable rule ${index + 1}`}
            onClick={() => void run({ type: supported(entry.rule) && entry.rule.enabled === false
              ? 'enable' : 'disable', id: entry.id })}>
            {supported(entry.rule) && entry.rule.enabled === false ? t`Enable` : t`Disable`}</button>
          <button type="button" disabled={state.busy || index === 0}
            aria-label={t`Move rule ${index + 1} up`}
            onClick={() => void run({ type: 'move-up', id: entry.id })}>↑</button>
          <button type="button" disabled={state.busy || index === (config?.rules.length ?? 0) - 1}
            aria-label={t`Move rule ${index + 1} down`}
            onClick={() => void run({ type: 'move-down', id: entry.id })}>↓</button>
          <button type="button" disabled={state.busy} aria-label={t`Delete rule ${index + 1}`}
            onClick={() => void run({ type: 'remove', id: entry.id })}><Trans>Delete</Trans></button>
          </div>
        </li>)}</ul>
        <button type="button" disabled={state.busy} onClick={() => void run('new')}><Trans>New rule</Trans></button>
      </section>
      <form noValidate onSubmit={(event) => { event.preventDefault(); void run('save') }}>
        <h3>{state.ruleId ? t`Edit rule` : t`New rule`}</h3>
        <fieldset disabled={state.busy}>
          <label htmlFor={`${id}-range`}><Trans>Applies to</Trans></label>
          <input id={`${id}-range`} value={state.range} spellCheck={false}
            placeholder="A1:A10, C1:C10"
            onChange={(event) => void run({ type: 'draft', range: event.currentTarget.value })} />
          <label htmlFor={`${id}-kind`}><Trans>Rule type</Trans></label>
          <select id={`${id}-kind`} value={state.rule.kind}
            onChange={(event) => void run({ type: 'kind', kind: event.currentTarget.value as NativeConditionalFormatRule['kind'] })}>
            <option value="cell-value"><Trans>Cell value</Trans></option>
            <option value="formula"><Trans>Formula</Trans></option>
            <option value="top-bottom"><Trans>Top / bottom</Trans></option>
            <option value="text"><Trans>Text</Trans></option>
            <option value="duplicate-values"><Trans>Duplicate / unique values</Trans></option>
            <option value="color-scale"><Trans>Color scale</Trans></option>
            <option value="data-bar"><Trans>Data bar</Trans></option>
            <option value="icon-set"><Trans>Icon set</Trans></option>
          </select>
          <AdvancedFormattingFields idPrefix={id} />
          {state.rule.kind === 'cell-value' && <>
          <label htmlFor={`${id}-operator`}><Trans>Condition</Trans></label>
          <select id={`${id}-operator`} value={state.rule.operator}
            onChange={(event) => void run({ type: 'draft', rule: {
              operator: event.currentTarget.value as CellValueRule['operator'],
            } })}>
            {Object.entries(OPERATORS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <label htmlFor={`${id}-value`}>{between ? t`Minimum` : t`Value`}</label>
          <input id={`${id}-value`} inputMode="decimal" value={state.rule.value}
            onChange={(event) => void run({ type: 'draft', rule: { value: event.currentTarget.value } })} />
          {between && <>
            <label htmlFor={`${id}-value2`}><Trans>Maximum</Trans></label>
            <input id={`${id}-value2`} inputMode="decimal" value={state.rule.value2 ?? ''}
              onChange={(event) => void run({ type: 'draft', rule: { value2: event.currentTarget.value } })} />
          </>}
          </>}
          {state.rule.kind === 'formula' && <>
            <label htmlFor={`${id}-formula`}><Trans>Formula</Trans></label>
            <input id={`${id}-formula`} value={state.rule.formula} spellCheck={false}
              aria-describedby={`${id}-formula-hint`} placeholder="=$A1>10"
              onChange={(event) => void run({ type: 'draft', rule: { formula: event.currentTarget.value } })} />
            <p id={`${id}-formula-hint`}><Trans>Use commas between ranges. Write the formula for the first range’s top-left cell. Use $ to lock a row or column.</Trans></p>
          </>}
          {state.rule.kind === 'top-bottom' && <>
            <label htmlFor={`${id}-direction`}><Trans>Rank direction</Trans></label>
            <select id={`${id}-direction`} value={state.rule.direction}
              onChange={(event) => void run({ type: 'draft', rule: { direction: event.currentTarget.value === 'bottom' ? 'bottom' : 'top' } })}>
              <option value="top"><Trans>Top</Trans></option><option value="bottom"><Trans>Bottom</Trans></option>
            </select>
            <label htmlFor={`${id}-unit`}><Trans>Rank by</Trans></label>
            <select id={`${id}-unit`} value={state.rule.percent ? 'percent' : 'items'}
              onChange={(event) => void run({ type: 'draft', rule: { percent: event.currentTarget.value === 'percent' } })}>
              <option value="items"><Trans>Items</Trans></option><option value="percent"><Trans>Percentage</Trans></option>
            </select>
            <label htmlFor={`${id}-count`}>{state.rule.percent ? t`Percentage` : t`Number of items`}</label>
            <input id={`${id}-count`} type="number" min={state.rule.percent ? 0 : 1} max={state.rule.percent ? 100 : 1000} step="1"
              value={Number.isNaN(state.rule.count) ? '' : state.rule.count}
              onChange={(event) => void run({ type: 'draft', rule: { count: event.currentTarget.valueAsNumber } })} />
          </>}
          {(state.rule.kind === 'color-scale' || state.rule.kind === 'data-bar') && <>
            {state.rule.kind === 'color-scale' && <>
              <label htmlFor={`${id}-scale-count`}><Trans>Scale colors</Trans></label>
              <select id={`${id}-scale-count`} value={state.rule.midColor ? '3' : '2'}
                onChange={(event) => void run({ type: 'draft', rule: {
                  midColor: event.currentTarget.value === '3' ? '#ffeb84' : undefined,
                } })}>
                <option value="2"><Trans>2 colors</Trans></option><option value="3"><Trans>3 colors</Trans></option>
              </select>
            </>}
            <label htmlFor={`${id}-low-color`}>{state.rule.kind === 'color-scale' ? t`Minimum color` : t`Negative bar color`}</label>
            <input id={`${id}-low-color`} type="color" value={state.rule.minColor ?? '#f8696b'}
              onChange={(event) => void run({ type: 'draft', rule: { minColor: event.currentTarget.value } })} />
            {state.rule.kind === 'color-scale' && state.rule.midColor && <>
              <label htmlFor={`${id}-mid-color`}><Trans>Midpoint color</Trans></label>
              <input id={`${id}-mid-color`} type="color" value={state.rule.midColor}
                onChange={(event) => void run({ type: 'draft', rule: { midColor: event.currentTarget.value } })} />
            </>}
            <label htmlFor={`${id}-high-color`}>{state.rule.kind === 'color-scale' ? t`Maximum color` : t`Positive bar color`}</label>
            <input id={`${id}-high-color`} type="color" value={state.rule.maxColor ?? '#638ec6'}
              onChange={(event) => void run({ type: 'draft', rule: { maxColor: event.currentTarget.value } })} />
            <p><Trans>
              Automatic thresholds use the full numeric range.
              Advanced threshold fields override the default endpoints.
            </Trans></p>
          </>}
          <AdvancedConditionalFormatFields idPrefix={id} />
          {highlight && <>
          <label htmlFor={`${id}-stop`}><Trans>Stop if true</Trans></label>
          <input id={`${id}-stop`} type="checkbox"
            checked={'stopIfTrue' in state.rule && !!state.rule.stopIfTrue}
            onChange={(event) => void run({ type: 'draft', rule: { stopIfTrue: event.currentTarget.checked } })} />
          <p><Trans>When this rule matches, skip all lower rules for that cell.</Trans></p>
          <label htmlFor={`${id}-fill`}><Trans>Highlight fill</Trans></label>
          <input id={`${id}-fill`} type="color" value={highlight.bgColor ?? '#ffc7ce'}
            onChange={(event) => void run({ type: 'draft', rule: {
              format: { ...highlight, bgColor: event.currentTarget.value },
            } })} />
          <label htmlFor={`${id}-text`}><Trans>Highlight text</Trans></label>
          <input id={`${id}-text`} type="color" value={highlight.fgColor ?? '#9c0006'}
            onChange={(event) => void run({ type: 'draft', rule: {
              format: { ...highlight, fgColor: event.currentTarget.value },
            } })} />
          </>}
        </fieldset>
        {state.error && <p role="alert">{translateFeedback(i18n, state.error)}</p>}
        {state.busy && <p role="status"><Trans>Saving conditional formatting…</Trans></p>}
        <div className="conditional-format-actions">
          <button type="button" disabled={state.busy} onClick={() => void run('close')}><Trans>Cancel</Trans></button>
          <button type="submit" disabled={state.busy}>{state.ruleId ? t`Save rule` : t`Add rule`}</button>
        </div>
      </form>
    </dialog>}
  </>
}
