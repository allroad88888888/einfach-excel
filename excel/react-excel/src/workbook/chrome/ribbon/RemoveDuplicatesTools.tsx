import { useAtomValue, useSetAtom } from '@einfach/react'
import { editingSessionAtom, nativeDuplicatesPanelAtom, runNativeDuplicatesPanelAtom,
  toA1 } from '@einfach/spreadsheet-ui-core'
import { useId, useLayoutEffect, useRef } from 'react'
import { cycleDialogFocus } from './dialog-focus'
import './remove-duplicates.css'

/** 只渲染 Rust 的计数和有界样本；列勾选等草稿直接派发给 command atom。 */
export function RemoveDuplicatesTools() {
  const state = useAtomValue(nativeDuplicatesPanelAtom)
  const run = useSetAtom(runNativeDuplicatesPanelAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const trigger = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  const open = state.target !== null
  const busy = state.status === 'applying'
  const { draft, preview, target } = state
  const columnCount = target ? Math.min(256, target.range.colEnd - target.range.colStart + 1) : 0
  const columns = target ? Array.from({ length: columnCount },
    (_, index) => target.range.colStart + index) : []
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const opener = trigger.current
    if (!open || !dialog) return
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    dialog.querySelector('input')?.focus()
    return () => { dialog.close?.(); opener?.focus({ preventScroll: true }) }
  }, [open])
  async function locate(row: number, occurrence: 'duplicate' | 'first') {
    if (!await run({ type: 'locate', row, occurrence })) return
    // 等对话框解除模态后再聚焦网格，业务定位仍由 command atom 完成。
    requestAnimationFrame(() => trigger.current?.closest('.workbook')
      ?.querySelector<HTMLElement>('[data-workbook-grid="true"]')?.focus({ preventScroll: true }))
  }
  return <>
    <button ref={trigger} type="button" className="tool-button" aria-label="Remove duplicates"
      title="Remove duplicates" disabled={editing || busy} onClick={() => void run('open')}>≠</button>
    {open && <dialog ref={dialogRef} className="duplicates-dialog" aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`} onKeyDown={cycleDialogFocus}
      onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}>Remove duplicates</h2>
      <p id={`${id}-hint`}>Compare displayed values and keep the first record.
        Only cells inside the selected range move. Filtered-out rows stay in place;
        manually hidden rows are included.</p>
      <p>Range: {target && `${toA1(target.range.rowStart, target.range.colStart)}:${toA1(target.range.rowEnd, target.range.colEnd)}`}</p>
      <form onSubmit={(event) => { event.preventDefault(); void run('apply') }}>
        <label className="duplicates-check"><input type="checkbox" checked={draft.hasHeader} disabled={busy}
          onChange={(event) => void run({ type: 'draft', patch: { hasHeader: event.currentTarget.checked } })} />
          First row contains headers</label>
        <label>Text comparison
          <select value={draft.comparison} disabled={busy} onChange={(event) => void run({ type: 'draft',
            patch: { comparison: event.currentTarget.value as typeof draft.comparison } })}>
            <option value="ignoreCase">Ignore case</option><option value="exact">Exact text</option>
            <option value="trim">Trim whitespace</option><option value="trimIgnoreCase">Trim and ignore case</option>
          </select>
        </label>
        <fieldset disabled={busy}><legend>Comparison columns</legend>
          <div className="duplicates-actions">
            <button type="button" onClick={() => void run({ type: 'draft', patch: { columns } })}>Select all</button>
            <button type="button" onClick={() => void run({ type: 'draft', patch: { columns: [] } })}>Clear all</button>
          </div>
          <div className="duplicates-columns">{columns.map((col, index) => <label key={col} className="duplicates-check">
            <input type="checkbox" checked={draft.columns.includes(col)} aria-label={`Compare column ${toA1(0, col).slice(0, -1)}`}
              onChange={(event) => void run({ type: 'draft', patch: { columns: event.currentTarget.checked
                ? [...draft.columns, col].sort((a, b) => a - b)
                : draft.columns.filter((value) => value !== col) } })} />
            Column {toA1(0, col).slice(0, -1)}{draft.hasHeader && preview?.headers[index]
              ? ` — ${preview.headers[index]}` : ''}
          </label>)}</div>
        </fieldset>
        <div aria-busy={state.status === 'previewing'}>
          <p role="status">{busy ? 'Removing duplicates…' : state.status === 'previewing' ? 'Loading preview…'
            : preview ? `${preview.removedRows} duplicate records; ${preview.uniqueRows} unique records remain.`
              : 'Update the preview to review your changes.'}</p>
          {preview && <>
            <p>{preview.scannedRows} data rows compared;
              {' '}{preview.excludedRows} filtered-out rows unchanged.</p>
            {preview.sample.length > 0 && <div className="duplicates-table-scroll" tabIndex={0} aria-label="Duplicate samples">
              <table><caption>Duplicate records to remove</caption><thead><tr>
                <th scope="col">Row</th><th scope="col">First occurrence</th><th scope="col">Sample values</th>
              </tr></thead><tbody>{preview.sample.map((row) => <tr key={row.row}>
                <th scope="row"><button type="button" className="duplicates-row-link" disabled={busy}
                  aria-label={`Go to duplicate row ${row.row + 1}`}
                  onClick={() => void locate(row.row, 'duplicate')}>{row.row + 1}</button></th>
                <td><button type="button" className="duplicates-row-link" disabled={busy}
                  aria-label={`Go to first occurrence row ${row.firstRow + 1} for duplicate row ${row.row + 1}`}
                  onClick={() => void locate(row.row, 'first')}>{row.firstRow + 1}</button></td>
                <td>{row.values.map((value) => value || '(Empty)').join(' · ')}</td>
              </tr>)}</tbody></table>
            </div>}
            {preview.removedRows > 0 && <nav className="duplicates-pagination"
              aria-label="Duplicate preview pages">
              <span>Showing {preview.sampleOffset + 1}–{preview.sampleOffset +
                preview.sample.length}
                {' '}of {preview.removedRows} duplicate records</span>
              {preview.removedRows > 20 && <><button type="button" disabled={busy || preview.sampleOffset === 0}
                onClick={() => void run({ type: 'page', offset: Math.max(0, preview.sampleOffset - 20) })}>Previous page</button>
              <button type="button" disabled={busy || preview.sampleOffset + preview.sample.length >= preview.removedRows}
                onClick={() => void run({ type: 'page', offset: preview.sampleOffset + 20 })}>Next page</button></>}
            </nav>}
            {preview.sampleTruncated && <p className="duplicates-hint">
              Each page shows up to 20 duplicate rows, 12 columns and 120 characters per field.
              Removal processes the full selected range.
            </p>}
            {preview.removedRows > 0 && <label className="duplicates-check duplicates-warning">
              <input type="checkbox" checked={state.confirmed} disabled={busy}
                onChange={(event) => void run({ type: 'confirm', value: event.currentTarget.checked })} />
              Remove {preview.removedRows} duplicate records (one undo restores them)
            </label>}
          </>}
        </div>
        {state.error && <p role="alert">{state.error}</p>}
        <div className="duplicates-actions">
          <button type="button" disabled={busy} onClick={() => void run('close')}>Cancel</button>
          <button type="button" disabled={state.status !== 'idle'} onClick={() => void run('preview')}>Update preview</button>
          <button type="submit" disabled={state.status !== 'idle' || !preview?.removedRows || !state.confirmed}>Remove records</button>
        </div>
      </form>
    </dialog>}
  </>
}
