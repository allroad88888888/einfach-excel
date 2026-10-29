import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { editingSessionAtom, runTextColumnsPanelAtom, textColumnsPanelAtom, toA1 } from '@einfach-excel/spreadsheet-ui-core'
import { useId, useLayoutEffect, useRef } from 'react'
import { cycleDialogFocus } from './dialog-focus'
import { TextColumnTypes } from './TextColumnTypes'
import { TextColumnNumberOptions } from './TextColumnNumberOptions'
import './text-columns.css'

/** 只渲染草稿和 Rust 样本；分列与覆盖检查不在 React 执行。 */
export function TextColumnsTools() {
  const { i18n, t } = useLingui()
  const DELIMITERS = [[t`Comma`, ','], [t`Tab`, '\t'], [t`Semicolon`, ';'], [t`Space`, ' ']] as const

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
    <button ref={trigger} type="button" className="tool-button" aria-label={t`Text to columns`}
      title={t`Text to columns`} disabled={editing || busy} onClick={() => void run('open')}>⇥</button>
    {open && <dialog ref={dialogRef} className="text-columns-dialog" aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`} onKeyDown={cycleDialogFocus}
      onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}><Trans>Text to columns</Trans></h2>
      <p id={`${id}-hint`}><Trans>Split one source column. Fields keep text unless you select a different type.
        Empty fields clear destination cells. Hidden rows are included.</Trans></p>
      <p className="text-columns-source"><Trans>Source: {state.target &&
        `${toA1(state.target.source.rowStart, state.target.source.colStart)}:${toA1(state.target.source.rowEnd, state.target.source.colEnd)}`}</Trans></p>
      <form onSubmit={(event) => { event.preventDefault(); void run('apply') }}>
        <div className="text-columns-fields">
          <label><Trans>Split mode
            </Trans><select value={draft.kind} disabled={busy} onChange={(event) => void run({
              type: 'draft', patch: { kind: event.currentTarget.value as typeof draft.kind },
            })}><option value="delimited"><Trans>Delimited</Trans></option><option value="fixedWidth"><Trans>Fixed width</Trans></option></select>
          </label>
          <label><Trans>Destination cell
            </Trans><input value={draft.destination} disabled={busy} spellCheck={false}
              onChange={(event) => void run({ type: 'draft', patch: { destination: event.currentTarget.value } })} />
          </label>
        </div>
        {draft.kind === 'delimited' ? <>
          <fieldset disabled={busy}><legend><Trans>Delimiters</Trans></legend>
            <div className="text-columns-delimiters">{DELIMITERS.map(([label, value]) =>
              <label key={value}><input type="checkbox" checked={draft.delimiters.includes(value)}
                onChange={(event) => void run({ type: 'delimiter', value, enabled: event.currentTarget.checked })} />{label}</label>,
            )}</div>
          </fieldset>
          <div className="text-columns-fields">
            <label><Trans>Other delimiter characters
              </Trans><input value={draft.otherDelimiter} disabled={busy} maxLength={16}
                onChange={(event) => void run({ type: 'draft', patch: { otherDelimiter: event.currentTarget.value } })} />
            </label>
            <label><Trans>Text qualifier
              </Trans><select value={draft.qualifier ?? ''} disabled={busy}
                onChange={(event) => void run({ type: 'draft', patch: { qualifier: event.currentTarget.value || null } })}>
                <option value={'"'}><Trans>Double quote (&quot;)</Trans></option><option value="'"><Trans>Single quote (&apos;)</Trans></option>
                <option value=""><Trans>None</Trans></option>
              </select>
            </label>
          </div>
          <label className="text-columns-check"><input type="checkbox" disabled={busy}
            checked={draft.mergeConsecutive} onChange={(event) => void run({
              type: 'draft', patch: { mergeConsecutive: event.currentTarget.checked },
            })} /><Trans>Treat consecutive delimiters as one</Trans></label>
        </> : <div><label><Trans>Break positions
          </Trans><input value={draft.breakpoints} disabled={busy} aria-describedby={`${id}-break-hint`}
            onChange={(event) => void run({ type: 'draft', patch: { breakpoints: event.currentTarget.value } })} />
        </label><p id={`${id}-break-hint`} className="text-columns-hint"><Trans>
          Split after these character positions, for example 2, 5.
          Unicode code points count as one.
        </Trans></p></div>}
        <TextColumnTypes />
        <TextColumnNumberOptions />
        <div className="text-columns-preview" aria-busy={state.status === 'previewing'}>
          <div role="status">{busy ? t`Applying split…` : state.status === 'previewing' ? t`Loading preview…`
            : preview ? t`Output: ${toA1(preview.target.rowStart, preview.target.colStart)}:${toA1(preview.target.rowEnd, preview.target.colEnd)}`
              : t`Update the preview to apply your changes.`}</div>
          {preview && <>
            <div className="text-columns-table-scroll" tabIndex={0} aria-label={t`Preview cells`}>
              <table><caption><Trans>Split preview</Trans></caption><thead><tr><th scope="col"><Trans>Row</Trans></th>
                {preview.sample[0]?.map((_, col) => <th scope="col" key={col}>
                  {toA1(preview.target.rowStart, preview.target.colStart + col)}
                </th>)}
              </tr></thead><tbody>{preview.sample.map((row, index) => <tr key={index}>
                <th scope="row">{preview.target.rowStart + index + 1}</th>
                {row.map((value, col) => <td key={col}>{value || <span className="text-columns-hint"><Trans>(Empty)</Trans></span>}</td>)}
              </tr>)}</tbody></table>
            </div>
            {preview.sampleTruncated && <p className="text-columns-hint"><Trans>
              Sample shortened: up to 20 rows, 12 columns and 120 characters per field.
              Apply processes all source rows.
            </Trans></p>}
            {preview.overwrittenCells > 0 && <label className="text-columns-check text-columns-warning">
              <input type="checkbox" checked={state.overwrite} disabled={busy}
                onChange={(event) => void run({ type: 'overwrite', value: event.currentTarget.checked })} /><Trans>
              Overwrite </Trans>{preview.overwrittenCells}<Trans> occupied destination cells
            </Trans></label>}
          </>}
        </div>
        {state.error && <p role="alert">{translateFeedback(i18n, state.error)}</p>}
        <div className="text-columns-actions">
          <button type="button" disabled={busy} onClick={() => void run('close')}><Trans>Cancel</Trans></button>
          <button type="button" disabled={state.status !== 'idle'} onClick={() => void run('preview')}><Trans>Update preview</Trans></button>
          <button type="submit" disabled={state.status !== 'idle' || !preview ||
            (preview.overwrittenCells > 0 && !state.overwrite)}><Trans>Apply split</Trans></button>
        </div>
      </form>
    </dialog>}
  </>
}
