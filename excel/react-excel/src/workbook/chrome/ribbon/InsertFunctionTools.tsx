import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId, useLayoutEffect, useRef } from 'react'
import { insertFunctionPanelAtom, runInsertFunctionAtom,
  renderFormulaFunctionSignature } from '@einfach/spreadsheet-ui-core'
import { cycleDialogFocus } from './dialog-focus'
import './insert-function.css'

/** 函数目录只读原生元数据，插入后由公式栏接管草稿与焦点。 */
export function InsertFunctionTools() {
  const panel = useAtomValue(insertFunctionPanelAtom)
  const run = useSetAtom(runInsertFunctionAtom)
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
    <button ref={trigger} type="button" className="tool-button" aria-label="Insert function"
      title="Insert function" disabled={!panel.available} onClick={() => run('open')}>ƒx</button>
    {panel.open && <dialog ref={dialogRef} className="insert-function-panel" aria-labelledby={`${id}-title`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
          event.preventDefault(); event.stopPropagation(); run('close')
        } else cycleDialogFocus(event)
      }} onCancel={(event) => { event.preventDefault(); run('close') }}>
      <h2 id={`${id}-title`}>Insert function</h2>
      <p>{panel.total} functions available in this build.
        Insert a draft, then enter arguments in the formula bar.</p>
      <form onSubmit={(event) => { event.preventDefault(); run('insert') }}>
        <label htmlFor={`${id}-search`}>Search functions</label>
        <input id={`${id}-search`} type="search" autoComplete="off" value={panel.query}
          placeholder="For example, XLOOKUP" onChange={(event) => run({ query: event.currentTarget.value })} />
        <label htmlFor={`${id}-category`}>Category</label>
        <select id={`${id}-category`} value={panel.category}
          onChange={(event) => run({ category: event.currentTarget.value })}>
          <option value="">All categories</option>
          {panel.categories.map((category) => <option key={category}>{category}</option>)}
        </select>
        <label htmlFor={`${id}-function`}>Function</label>
        <select id={`${id}-function`} size={7} value={panel.selected?.name ?? ''}
          disabled={!panel.functions.length}
          onChange={(event) => run({ name: event.currentTarget.value })}>
          {panel.functions.map((entry) => <option key={entry.name}>{entry.name}</option>)}
        </select>
        {!panel.functions.length && <p role="status">No matching functions. Change the search or category.</p>}
        {panel.selected && <div className="insert-function-description" aria-live="polite">
          <code>{panel.selected.signatureAvailable
            ? renderFormulaFunctionSignature(panel.selected) : `${panel.selected.name}(…)`}</code>
          <p>{panel.selected.summary}</p>
        </div>}
        {panel.error && <p role="alert">{panel.error}</p>}
        <div className="insert-function-actions">
          <button type="button" onClick={() => run('close')}>Cancel</button>
          <button type="submit" disabled={!panel.selected}>Insert draft</button>
        </div>
      </form>
    </dialog>}
  </>
}
