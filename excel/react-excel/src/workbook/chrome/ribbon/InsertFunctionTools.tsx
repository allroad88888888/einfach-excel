import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId, useLayoutEffect, useRef } from 'react'
import { insertFunctionPanelAtom, runInsertFunctionAtom,
  runFormulaArgumentsAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { FormulaParameterHelp } from '../../formula-help/FormulaParameterHelp'
import { FormulaArgumentsDialog } from '../../formula-arguments/FormulaArgumentsDialog'
import { cycleDialogFocus } from './dialog-focus'
import './insert-function.css'

/** 函数目录只读原生元数据，插入后由公式栏接管草稿与焦点。 */
export function InsertFunctionTools() {
  const { i18n, t } = useLingui()
  const panel = useAtomValue(insertFunctionPanelAtom)
  const run = useSetAtom(runInsertFunctionAtom)
  const runArguments = useSetAtom(runFormulaArgumentsAtom)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const opener = trigger.current
    if (!panel.open || !dialog) return
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    dialog.querySelector<HTMLInputElement>('input')?.focus()
    return () => { dialog.close?.(); opener?.focus({ preventScroll: true }) }
  }, [panel.open])
  return <>
    <button ref={trigger} type="button" className="tool-button" data-insert-function-trigger aria-label={t`Insert function`}
      title={t`Insert function`} disabled={!panel.available} onClick={() => run('open')}>ƒx</button>
    {panel.open && <dialog ref={dialogRef} className="insert-function-panel" aria-labelledby={`${id}-title`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
          event.preventDefault(); event.stopPropagation(); run('close')
        } else cycleDialogFocus(event)
      }} onCancel={(event) => { event.preventDefault(); run('close') }}>
      <h2 id={`${id}-title`}><Trans>Insert function</Trans></h2>
      <p><Trans>{panel.total} functions available in this build.
        Insert a draft, then enter arguments in the formula bar.</Trans></p>
      <form onSubmit={(event) => { event.preventDefault(); run('insert') }}>
        <label htmlFor={`${id}-search`}><Trans>Search functions</Trans></label>
        <input id={`${id}-search`} type="search" autoComplete="off" value={panel.query}
          placeholder={t`For example, XLOOKUP`} onChange={(event) => run({ query: event.currentTarget.value })} />
        <label htmlFor={`${id}-category`}><Trans>Category</Trans></label>
        <select id={`${id}-category`} value={panel.category}
          onChange={(event) => run({ category: event.currentTarget.value })}>
          <option value=""><Trans>All categories</Trans></option>
          {panel.categories.map((category) => <option key={category} value={category}>
            {translateFeedback(i18n, category)}</option>)}
        </select>
        <label htmlFor={`${id}-function`}><Trans>Function</Trans></label>
        <select id={`${id}-function`} size={7} value={panel.selected?.name ?? ''}
          disabled={!panel.functions.length}
          onChange={(event) => run({ name: event.currentTarget.value })}>
          {panel.functions.map((entry) => <option key={entry.name}>{entry.name}</option>)}
        </select>
        {!panel.functions.length && <p role="status"><Trans>No matching functions. Change the search or category.</Trans></p>}
        {panel.selected && <div className="insert-function-description" aria-live="polite">
          <FormulaParameterHelp spec={panel.selected} />
        </div>}
        {panel.error && <p role="alert">{translateFeedback(i18n, panel.error)}</p>}
        <div className="insert-function-actions">
          <button type="button" onClick={() => run('close')}><Trans>Cancel</Trans></button>
          <button type="button" disabled={!panel.selected || panel.selected.signatureAvailable === false}
            onClick={() => {
              if (panel.selected && runArguments({ open: panel.selected.name })) run('close')
            }}><Trans>Fill arguments</Trans></button>
          <button type="submit" disabled={!panel.selected}><Trans>Insert draft</Trans></button>
        </div>
      </form>
    </dialog>}
    <FormulaArgumentsDialog />
  </>
}
