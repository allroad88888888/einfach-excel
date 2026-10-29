import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId, useLayoutEffect, useRef } from 'react'
import {
  activeWorkbookSheetAtom, editingSessionAtom, nativeNameManagerAtom, nativeNamedRangesAtom,
  projectionSnapshotAtom, runNativeNameManagerAtom, nativeNameManagerOpenAtom,
  workbookDocumentAtom, rangeToA1,
} from '@einfach-excel/spreadsheet-ui-core'
import { cycleDialogFocus } from './dialog-focus'
import { NamedTableList } from './NamedTableList'
import './named-range-panel.css'

/** 目录只读 Rust 投影；字段直接写 UI Core 草稿，React 不保存名称副本。 */
export function NamedRangeTools() {
  const { i18n, t } = useLingui()
  const state = useAtomValue(nativeNameManagerAtom)
  const names = useAtomValue(nativeNamedRangesAtom)
  const sheets = useAtomValue(workbookDocumentAtom).sheets
  const active = useAtomValue(activeWorkbookSheetAtom)
  const projection = useAtomValue(projectionSnapshotAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const run = useSetAtom(runNativeNameManagerAtom)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  const open = useAtomValue(nativeNameManagerOpenAtom)
  const ready = projection.status === 'ready' && projection.result?.kind === 'visible-window' &&
    projection.result.sheetId === active?.id && projection.result.namedRanges !== undefined
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
    <button ref={trigger} type="button" className="tool-button" aria-label={t`Name manager`}
      title={t`Name manager`} disabled={!ready || editing || state.busy}
      onClick={() => void run('open')}><span aria-hidden="true">≔</span></button>
    {open && <dialog ref={dialogRef} className="named-range-panel" aria-labelledby={`${id}-title`}
      onKeyDown={cycleDialogFocus} onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}><Trans>Name manager</Trans></h2>
      <p><Trans>Name a cell or range to use it in formulas.
        Names are available throughout this workbook.</Trans></p>
      <div className="named-range-list" role="group" aria-label={t`Workbook names`}>
        {names.length === 0 && <p><Trans>No named ranges yet. Create one below.</Trans></p>}
        {names.map((entry) => {
          const target = entry.target
          const sheet = sheets.find((candidate) => candidate.index === target?.sheet)
          const reference = target && sheet ? `${sheet.name}!${rangeToA1({
            rowStart: target.range[0], colStart: target.range[1],
            rowEnd: target.range[2], colEnd: target.range[3],
          })}` : '#REF!'
          return <button key={entry.name} type="button" disabled={state.busy}
            aria-label={t`Edit ${entry.name}`} aria-pressed={state.editingName === entry.name}
            onClick={() => void run({ edit: entry.name })}>
            <strong>{entry.name}</strong><span>{reference}</span>
          </button>
        })}
      </div>
      <NamedTableList />
      <form onSubmit={(event) => { event.preventDefault(); void run('save') }}>
        <div className="named-range-heading">
          <h3>{state.editingName ? t`Edit named range` : t`New named range`}</h3>
          <button type="button" disabled={state.busy} onClick={() => void run('new')}><Trans>New name</Trans></button>
        </div>
        <fieldset disabled={state.busy}>
          <label htmlFor={`${id}-name`}><Trans>Name</Trans></label>
          <input id={`${id}-name`} value={state.name} required autoComplete="off"
            onChange={(event) => void run({ name: event.currentTarget.value })} />
          <label htmlFor={`${id}-sheet`}><Trans>Worksheet</Trans></label>
          <select id={`${id}-sheet`} value={state.targetSheetId}
            onChange={(event) => void run({ targetSheetId: event.currentTarget.value })}>
            {sheets.map((sheet) => <option key={sheet.id} value={sheet.id}>{sheet.name}</option>)}
          </select>
          <label htmlFor={`${id}-range`}><Trans>Refers to</Trans></label>
          <input id={`${id}-range`} value={state.range} required placeholder="A1:A100"
            aria-describedby={`${id}-range-hint`}
            onChange={(event) => void run({ range: event.currentTarget.value })} />
        </fieldset>
        <p id={`${id}-range-hint`}>{state.range === '#REF!'
          ? t`The original range was deleted. Enter a new range to repair this name.`
          : t`Enter a cell or range on the selected worksheet, for example A1:A100.`}</p>
        {state.error && <p role="alert">{translateFeedback(i18n, state.error)}</p>}
        {state.busy && <p role="status"><Trans>Saving changes…</Trans></p>}
        <div className="named-range-actions">
          <button type="button" disabled={state.busy || !state.editingName}
            onClick={() => void run('delete')}><Trans>Delete name</Trans></button>
          <button type="button" disabled={state.busy} onClick={() => void run('close')}><Trans>Cancel</Trans></button>
          <button type="submit" disabled={state.busy}>
            {state.editingName ? t`Save changes` : t`Create name`}
          </button>
        </div>
      </form>
    </dialog>}
  </>
}
