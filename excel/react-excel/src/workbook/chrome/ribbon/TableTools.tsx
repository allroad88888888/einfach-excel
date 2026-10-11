import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId, useLayoutEffect, useRef } from 'react'
import { editingSessionAtom, nativeTablePanelAtom, runNativeTablePanelAtom } from '@einfach/spreadsheet-ui-core'
import { cycleDialogFocus } from './dialog-focus'
import { TableTotals } from './TableTotals'
import { TableColumns } from './TableColumns'
import './table-panel.css'

/** React 只负责弹窗与焦点；Table 目录、草稿和动作直接读写 UI Core atoms。 */
export function TableTools() {
  const state = useAtomValue(nativeTablePanelAtom)
  const run = useSetAtom(runNativeTablePanelAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const trigger = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const opener = trigger.current
    if (!state.open || !dialog) return
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    dialog.querySelector<HTMLInputElement>('input')?.focus()
    return () => { dialog.close?.(); opener?.focus({ preventScroll: true }) }
  }, [state.open])
  return <>
    <button ref={trigger} className="tool-button" type="button" aria-label="Tables" title="Tables"
      disabled={!state.ready || editing || state.busy} onClick={() => void run('open')}>
      <span aria-hidden="true">▤</span>
    </button>
    {state.open && <dialog ref={dialogRef} className="table-panel" aria-labelledby={`${id}-title`}
      onKeyDown={cycleDialogFocus} onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}>Tables</h2>
      <p>Create a named table from a range, or manage tables on this worksheet.</p>
      <div className="table-panel-list" role="group" aria-label="Worksheet tables">
        {state.tables.length === 0 && <p>No tables yet. Choose a range below.</p>}
        {state.tables.map((table) => <button type="button" key={table.name} disabled={state.busy}
          aria-label={`Edit table ${table.name}`} aria-pressed={state.editingName === table.name}
          onClick={() => void run({ edit: table.name })}>
          <strong>{table.name}</strong><span>{table.range}</span>
        </button>)}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void run('save') }}>
        <div className="table-panel-heading">
          <h3>{state.editingName ? 'Edit table' : 'Create table'}</h3>
          <button type="button" disabled={state.busy} onClick={() => void run('new')}>New table</button>
        </div>
        <fieldset disabled={state.busy}>
          <label htmlFor={`${id}-name`}>Table name</label>
          <input id={`${id}-name`} value={state.name} autoComplete="off" placeholder="Automatic name"
            required={Boolean(state.editingName)}
            onChange={(event) => void run({ name: event.currentTarget.value })} />
          <label htmlFor={`${id}-range`}>Table range</label>
          <input id={`${id}-range`} value={state.range} required
            aria-describedby={`${id}-hint`} placeholder="A1:C10"
            onChange={(event) => void run({ range: event.currentTarget.value })} />
        </fieldset>
        <p id={`${id}-hint`}>{state.editingName
          ? 'Resize keeps the header row fixed. Include the totals row when shown. Convert to range keeps your data and formatting.'
          : 'The first row becomes the header. Blank or duplicate headers receive unique names.'}</p>
        {state.error && <p role="alert">{state.error}</p>}
        {state.busy && <p role="status">Saving table changes…</p>}
        <div className="table-panel-actions">
          <button type="button" disabled={state.busy || !state.editingName}
            onClick={() => void run('convert')}>Convert to range</button>
          {state.editingName && <button type="button" disabled={state.busy}
            onClick={() => void run('resize')}>Resize table</button>}
          <button type="button" disabled={state.busy} onClick={() => void run('close')}>Cancel</button>
          <button type="submit" disabled={state.busy}>
            {state.editingName ? 'Rename table' : 'Create table'}
          </button>
        </div>
      </form>
      <TableColumns />
      <TableTotals />
    </dialog>}
  </>
}
