import { useAtomValue, useSetAtom } from '@einfach/react'
import { editingSessionAtom, runTextColumnsPanelAtom, textColumnsPanelAtom, toA1 } from '@einfach/spreadsheet-ui-core'
import { useId, useLayoutEffect, useRef } from 'react'
import { cycleDialogFocus } from './dialog-focus'
import './text-columns.css'

const DELIMITERS = [['Comma', ','], ['Tab', '\t'], ['Semicolon', ';'], ['Space', ' ']] as const

/** 只渲染草稿和 Rust 样本；分列与覆盖检查不在 React 执行。 */
export function TextColumnsTools() {
  const state = useAtomValue(textColumnsPanelAtom)
  const run = useSetAtom(runTextColumnsPanelAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const trigger = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  const open = state.target !== null
  const busy = state.status === 'applying'
  const { draft, preview } = state
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const opener = trigger.current
    if (!open || !dialog) return
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    dialog.querySelector('select')?.focus()
    return () => { dialog.close?.(); opener?.focus({ preventScroll: true }) }
  }, [open])
  return <>
    <button ref={trigger} type="button" className="tool-button" aria-label="Text to columns"
      title="Text to columns" disabled={editing || busy} onClick={() => void run('open')}>⇥</button>
    {open && <dialog ref={dialogRef} className="text-columns-dialog" aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`} onKeyDown={cycleDialogFocus}
      onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}>Text to columns</h2>
      <p id={`${id}-hint`}>Split one source column. Results stay as text, including leading zeros.
        Empty fields clear destination cells. Hidden rows are included.</p>
      <p className="text-columns-source">Source: {state.target &&
        `${toA1(state.target.source.rowStart, state.target.source.colStart)}:${toA1(state.target.source.rowEnd, state.target.source.colEnd)}`}</p>
      <form onSubmit={(event) => { event.preventDefault(); void run('apply') }}>
        <div className="text-columns-fields">
          <label>Split mode
            <select value={draft.kind} disabled={busy} onChange={(event) => void run({
              type: 'draft', patch: { kind: event.currentTarget.value as typeof draft.kind },
            })}><option value="delimited">Delimited</option><option value="fixedWidth">Fixed width</option></select>
          </label>
          <label>Destination cell
            <input value={draft.destination} disabled={busy} spellCheck={false}
              onChange={(event) => void run({ type: 'draft', patch: { destination: event.currentTarget.value } })} />
          </label>
        </div>
        {draft.kind === 'delimited' ? <>
          <fieldset disabled={busy}><legend>Delimiters</legend>
            <div className="text-columns-delimiters">{DELIMITERS.map(([label, value]) =>
              <label key={label}><input type="checkbox" checked={draft.delimiters.includes(value)}
                onChange={(event) => void run({ type: 'delimiter', value, enabled: event.currentTarget.checked })} />{label}</label>,
            )}</div>
          </fieldset>
          <div className="text-columns-fields">
            <label>Other delimiter characters
              <input value={draft.otherDelimiter} disabled={busy} maxLength={16}
                onChange={(event) => void run({ type: 'draft', patch: { otherDelimiter: event.currentTarget.value } })} />
            </label>
            <label>Text qualifier
              <select value={draft.qualifier ?? ''} disabled={busy}
                onChange={(event) => void run({ type: 'draft', patch: { qualifier: event.currentTarget.value || null } })}>
                <option value={'"'}>Double quote (&quot;)</option><option value="'">Single quote (&apos;)</option>
                <option value="">None</option>
              </select>
            </label>
          </div>
          <label className="text-columns-check"><input type="checkbox" disabled={busy}
            checked={draft.mergeConsecutive} onChange={(event) => void run({
              type: 'draft', patch: { mergeConsecutive: event.currentTarget.checked },
            })} />Treat consecutive delimiters as one</label>
        </> : <div><label>Break positions
          <input value={draft.breakpoints} disabled={busy} aria-describedby={`${id}-break-hint`}
            onChange={(event) => void run({ type: 'draft', patch: { breakpoints: event.currentTarget.value } })} />
        </label><p id={`${id}-break-hint`} className="text-columns-hint">
          Split after these character positions, for example 2, 5.
          Unicode code points count as one.
        </p></div>}
        <div className="text-columns-preview" aria-busy={state.status === 'previewing'}>
          <div role="status">{busy ? 'Applying split…' : state.status === 'previewing' ? 'Loading preview…'
            : preview ? `Output: ${toA1(preview.target.rowStart, preview.target.colStart)}:${toA1(preview.target.rowEnd, preview.target.colEnd)}`
              : 'Update the preview to apply your changes.'}</div>
          {preview && <>
            <div className="text-columns-table-scroll" tabIndex={0} aria-label="Preview cells">
              <table><caption>Split preview</caption><thead><tr><th scope="col">Row</th>
                {preview.sample[0]?.map((_, col) => <th scope="col" key={col}>
                  {toA1(preview.target.rowStart, preview.target.colStart + col)}
                </th>)}
              </tr></thead><tbody>{preview.sample.map((row, index) => <tr key={index}>
                <th scope="row">{preview.target.rowStart + index + 1}</th>
                {row.map((value, col) => <td key={col}>{value || <span className="text-columns-hint">(Empty)</span>}</td>)}
              </tr>)}</tbody></table>
            </div>
            {preview.sampleTruncated && <p className="text-columns-hint">
              Sample shortened: up to 20 rows, 12 columns and 120 characters per field.
              Apply processes all source rows.
            </p>}
            {preview.overwrittenCells > 0 && <label className="text-columns-check text-columns-warning">
              <input type="checkbox" checked={state.overwrite} disabled={busy}
                onChange={(event) => void run({ type: 'overwrite', value: event.currentTarget.checked })} />
              Overwrite {preview.overwrittenCells} occupied destination cells
            </label>}
          </>}
        </div>
        {state.error && <p role="alert">{state.error}</p>}
        <div className="text-columns-actions">
          <button type="button" disabled={busy} onClick={() => void run('close')}>Cancel</button>
          <button type="button" disabled={state.status !== 'idle'} onClick={() => void run('preview')}>Update preview</button>
          <button type="submit" disabled={state.status !== 'idle' || !preview ||
            (preview.overwrittenCells > 0 && !state.overwrite)}>Apply split</button>
        </div>
      </form>
    </dialog>}
  </>
}
