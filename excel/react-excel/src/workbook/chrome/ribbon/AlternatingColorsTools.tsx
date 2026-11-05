import { useId, useLayoutEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  alternatingColorsDraftAtom, editingSessionAtom, nativeConditionalFormatPanelAtom,
  nativeConditionalFormatsAtom, runAlternatingColorsAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { translateFeedback } from '../../../i18n/translate-feedback'
import { cycleDialogFocus } from './dialog-focus'
import './conditional-format-panel.css'

export function AlternatingColorsTools() {
  const { i18n, t } = useLingui()
  const state = useAtomValue(nativeConditionalFormatPanelAtom)
  const draft = useAtomValue(alternatingColorsDraftAtom)
  const config = useAtomValue(nativeConditionalFormatsAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const run = useSetAtom(runAlternatingColorsAtom)
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const open = state.sheetId !== null && state.editor === 'alternating'
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const opener = trigger.current
    if (!open || !dialog) return
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    dialog.querySelector<HTMLInputElement>('input[type="color"]')?.focus()
    return () => { dialog.close?.(); opener?.focus({ preventScroll: true }) }
  }, [open])
  return <>
    <button ref={trigger} type="button" className="tool-button" aria-label={t`Alternating colors`}
      title={t`Alternating colors`} disabled={editing || !config || state.sheetId !== null}
      onClick={() => void run('open')}><span aria-hidden="true">▤</span></button>
    {open && <dialog ref={dialogRef} className="conditional-format-panel"
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-hint`} onKeyDown={cycleDialogFocus}
      onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}><Trans>Alternating colors</Trans></h2>
      <p id={`${id}-hint`}><Trans>Fill every other row. Other rows keep their original formatting. Select inside an existing band to change its whole range.</Trans></p>
      <form onSubmit={(event) => { event.preventDefault(); void run('save') }}>
        <fieldset disabled={state.busy}>
          <label htmlFor={`${id}-range`}><Trans>Applies to</Trans></label>
          <input id={`${id}-range`} value={state.range} readOnly />
          <label htmlFor={`${id}-color`}><Trans>Band color</Trans></label>
          <input id={`${id}-color`} type="color" value={draft.color}
            onChange={(event) => void run({ type: 'draft', color: event.currentTarget.value })} />
          <label htmlFor={`${id}-header`}><Trans>First row is a header</Trans></label>
          <input id={`${id}-header`} type="checkbox" checked={draft.header}
            onChange={(event) => void run({ type: 'draft', header: event.currentTarget.checked })} />
          <p><Trans>
            The header keeps its original formatting; banding starts on the next row.
          </Trans></p>
        </fieldset>
        {state.error && <p role="alert">{translateFeedback(i18n, state.error)}</p>}
        {state.busy && <p role="status"><Trans>Saving conditional formatting…</Trans></p>}
        <div className="conditional-format-actions">
          {draft.existing && <button type="button" disabled={state.busy}
            onClick={() => void run('remove')}><Trans>Remove banding</Trans></button>}
          <button type="button" disabled={state.busy} onClick={() => void run('close')}><Trans>Cancel</Trans></button>
          <button type="submit" disabled={state.busy || !draft.range}><Trans>Apply</Trans></button>
        </div>
      </form>
    </dialog>}
  </>
}
