import { useId, useLayoutEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui, Trans } from '@lingui/react/macro'
import { externalHyperlink, hyperlinkPanelAtom, runHyperlinkAtom, toA1 } from '@einfach/spreadsheet-ui-core'
import { cycleDialogFocus } from '../chrome/ribbon/dialog-focus'
import { translateFeedback } from '../../i18n/translate-feedback'
import './hyperlink.css'

/** React 只显示 UI Core 草稿；插入/修改/移除都提交同一个 command atom。 */
export function HyperlinkTools() {
  const { t, i18n } = useLingui()
  const state = useAtomValue(hyperlinkPanelAtom)
  const run = useSetAtom(runHyperlinkAtom)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  const address = toA1(state.cell.row, state.cell.col)
  const href = externalHyperlink(state.url)
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const opener = trigger.current
    if (!state.open || !dialog) return
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    dialog.querySelector<HTMLInputElement>('input[type="url"]')?.focus()
    return () => {
      dialog.close?.()
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [state.open])
  return <>
    <button ref={trigger} className="tool-button" type="button" aria-label={t`Hyperlink`}
      title={t`Hyperlink (Ctrl/⌘+K)`} disabled={!state.available || state.busy}
      onClick={() => void run('open')}><span aria-hidden="true">↗</span></button>
    {state.open && <dialog ref={dialogRef} className="hyperlink-panel" aria-labelledby={`${id}-title`}
      onKeyDown={cycleDialogFocus} onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}>{state.existing ? t`Edit hyperlink` : t`Insert hyperlink`}</h2>
      <p><Trans>Cell {address}. Click to select; Ctrl/⌘+click to open the link.</Trans></p>
      <form onSubmit={(event) => { event.preventDefault(); void run('save') }}>
        <fieldset disabled={state.busy}>
          <label htmlFor={`${id}-url`}><Trans>Link address</Trans></label>
          <input id={`${id}-url`} type="url" value={state.url} required maxLength={8192}
            placeholder={'https://example.com'} autoComplete="off"
            onChange={(event) => void run({ url: event.currentTarget.value })} />
          <label htmlFor={`${id}-text`}><Trans>Display text</Trans></label>
          <input id={`${id}-text`} value={state.text} maxLength={32767} autoComplete="off"
            onChange={(event) => void run({ text: event.currentTarget.value })} />
        </fieldset>
        <p className="hyperlink-hint"><Trans>Changing display text replaces the cell content with text.
          Leave it unchanged to keep its value or formula.</Trans></p>
        {state.error && <p className="hyperlink-error" role="alert">{translateFeedback(i18n, state.error)}</p>}
        {state.busy && <p role="status"><Trans>Saving hyperlink…</Trans></p>}
        <div className="hyperlink-actions">
          <button type="button" disabled={state.busy || !state.existing}
            onClick={() => void run('remove')}><Trans>Remove link</Trans></button>
          <button type="button" disabled={state.busy} onClick={() => void run('close')}><Trans>Cancel</Trans></button>
          <button type="submit" disabled={state.busy}>
            {state.existing ? t`Save changes` : t`Insert link`}
          </button>
        </div>
        {href && !state.busy && <a className="hyperlink-open" href={href} target="_blank" rel="noopener noreferrer">
          <Trans>Open link in a new tab</Trans>
        </a>}
      </form>
    </dialog>}
  </>
}
