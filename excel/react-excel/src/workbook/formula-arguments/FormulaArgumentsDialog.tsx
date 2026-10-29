import { useId, useLayoutEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { Trans, useLingui } from '@lingui/react/macro'
import { formulaArgumentsPanelAtom, runFormulaArgumentsAtom } from '@einfach-excel/spreadsheet-ui-core'
import { translateFeedback } from '../../i18n/translate-feedback'
import { cycleDialogFocus } from '../chrome/ribbon/dialog-focus'
import { FormulaParameterHelp } from '../formula-help/FormulaParameterHelp'
import './formula-arguments.css'

/** DOM focus stays here; all argument values and transitions belong to the Core command. */
export function FormulaArgumentsDialog() {
  const { i18n, t } = useLingui()
  const panel = useAtomValue(formulaArgumentsPanelAtom)
  const run = useSetAtom(runFormulaArgumentsAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  const chinese = i18n.locale.toLowerCase().startsWith('zh')
  useLayoutEffect(() => {
    const node = dialogRef.current
    if (!panel.open || !node) return
    if (node.showModal) node.showModal()
    else node.setAttribute('open', '')
    ;(node.querySelector<HTMLInputElement>('input') ??
      node.querySelector<HTMLButtonElement>('button[type="submit"]'))?.focus()
    return () => {
      const generated = node.returnValue === 'draft'
      node.close?.()
      if (!generated) document.querySelector<HTMLButtonElement>('[data-insert-function-trigger]')
        ?.focus({ preventScroll: true })
    }
  }, [panel.open])
  useLayoutEffect(() => {
    if (panel.errorField !== null) dialogRef.current
      ?.querySelector<HTMLInputElement>(`[data-formula-argument-index="${panel.errorField}"]`)?.focus()
  }, [panel.error, panel.errorField])
  if (!panel.open || !panel.spec) return null
  const fields = panel.fields
  const repeatStart = panel.spec.repeat?.start ?? panel.spec.args.findIndex((arg) => arg.repeats)
  const prefix = fields.filter((field) => field.groupIndex === null &&
    (repeatStart < 0 || field.prototypeIndex < repeatStart))
  const suffix = fields.filter((field) => field.groupIndex === null &&
    repeatStart >= 0 && field.prototypeIndex >= repeatStart)
  const renderField = (field: typeof fields[number]) => {
    const name = field.groupIndex === null ? field.arg.name : `${field.arg.name} (${field.groupIndex + 1})`
    const description = chinese && field.arg.descriptionZh
      ? field.arg.descriptionZh : field.arg.description
    return <div className="formula-argument-field" key={field.index} data-argument-name={field.arg.name}>
      <label htmlFor={`${id}-field-${field.index}`}>
        <code id={`${id}-field-name-${field.index}`}>{name}</code>
        <span>{field.arg.optional ? <Trans>Optional</Trans> : <Trans>Required</Trans>}</span>
      </label>
      <input id={`${id}-field-${field.index}`} data-formula-argument-index={field.index}
        value={field.value} disabled={panel.busy} autoComplete="off" spellCheck={false}
        aria-labelledby={`${id}-field-name-${field.index}`} aria-required={!field.arg.optional}
        aria-invalid={panel.errorField === field.index}
        aria-describedby={`${id}-expression-hint${description ? ` ${id}-description-${field.index}` : ''}`}
        onChange={(event) => run({ field: field.index, value: event.currentTarget.value })} />
      {description && <p id={`${id}-description-${field.index}`}>{description}</p>}
    </div>
  }
  return <dialog ref={dialogRef} className="formula-arguments-panel" aria-labelledby={`${id}-title`}
    aria-busy={panel.busy} onCancel={(event) => { event.preventDefault(); run('close') }}
    onKeyDown={(event) => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
        event.preventDefault(); event.stopPropagation(); run('close')
      } else cycleDialogFocus(event)
    }}>
    <h2 id={`${id}-title`}><Trans>Function arguments</Trans> · <code>{panel.spec.name}</code></h2>
    <FormulaParameterHelp spec={panel.spec} compact />
    <p id={`${id}-expression-hint`} className="formula-arguments-hint"><Trans>
      Enter Excel expressions: "text" for text, A1:A3 for ranges,
      or 'Sheet name'!A1 for another sheet. Nested functions and array constants are allowed.
    </Trans></p>
    <form onSubmit={(event) => {
      event.preventDefault()
      if (run('confirm') && dialogRef.current) dialogRef.current.returnValue = 'draft'
    }}>
      {prefix.map(renderField)}
      {panel.groups.map((group) => <fieldset key={group.index} className="formula-argument-group">
        <legend><Trans>Argument group {group.index + 1}</Trans></legend>
        {group.fields.map(renderField)}
        <button type="button" disabled={panel.busy || panel.groupCount <= panel.minGroups}
          onClick={() => run({ removeGroup: group.index })}><Trans>Remove group</Trans></button>
      </fieldset>)}
      {panel.spec.args.some((arg) => arg.repeats) && <button type="button" className="formula-arguments-add"
        disabled={panel.busy} onClick={() => run('add-group')}><Trans>Add argument group</Trans></button>}
      {suffix.map(renderField)}
      {!panel.spec.args.length && <p><Trans>This function takes no arguments.</Trans></p>}
      {panel.error && <p role="alert">{translateFeedback(i18n, panel.error)}</p>}
      <div className="formula-arguments-actions">
        <button type="button" onClick={() => run('close')}><Trans>Cancel</Trans></button>
        <button type="submit" disabled={panel.busy} title={t`Continue editing in the formula bar`}>
          <Trans>Create formula draft</Trans></button>
      </div>
      <p className="formula-arguments-hint"><Trans>
        The formula bar opens next. Press Enter to save or Escape to cancel.
      </Trans></p>
    </form>
  </dialog>
}
