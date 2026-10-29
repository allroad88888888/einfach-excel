import { useAtomValue, useSetAtom } from '@einfach/react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useId, useLayoutEffect, useRef } from 'react'
import { nativeValidationConfirmationAtom, runNativeValidationConfirmationAtom } from '@einfach-excel/spreadsheet-ui-core'
import { cycleDialogFocus } from '../chrome/ribbon/dialog-focus'
import { translateFeedback } from '../../i18n/translate-feedback'
import './advanced-validation.css'

/** 确认只发明确原生继续命令；取消保留原编辑草稿。 */
export function ValidationErrorAlert() {
  const { t, i18n } = useLingui()
  const state = useAtomValue(nativeValidationConfirmationAtom)
  const run = useSetAtom(runNativeValidationConfirmationAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  const open = state !== null && state.style !== 'stop'
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const opener = document.activeElement as HTMLElement | null
    if (!open || !dialog) return
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    dialog.querySelector<HTMLButtonElement>('button')?.focus()
    return () => {
      dialog.close?.()
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [open])
  if (!state) return null
  const title = state.title || (state.style === 'stop' ? t`Invalid input`
    : state.style === 'warning' ? t`Validation warning` : t`Validation information`)
  if (state.style === 'stop') return <aside className="validation-stop-message" role="status"
    aria-labelledby={`${id}-title`}>
    <strong id={`${id}-title`}>{title}</strong>
    <p>{state.message || t`This input does not satisfy the cell's data validation rule.`}</p>
    <button type="button" aria-label={t`Dismiss validation message`}
      onClick={() => void run('cancel')}>×</button>
  </aside>
  return <dialog ref={dialogRef} className="validation-error-alert" aria-labelledby={`${id}-title`}
    onKeyDown={cycleDialogFocus} onCancel={event => { event.preventDefault(); void run('cancel') }}>
    <h2 id={`${id}-title`}>{title}</h2>
    <p>{state.message || t`This input does not satisfy the cell's data validation rule.`}</p>
    <p><Trans>Continue with this input?</Trans></p>
    {state.error && <p role="alert">{translateFeedback(i18n, state.error)}</p>}
    {state.busy && <p role="status"><Trans>Submitting input…</Trans></p>}
    <div className="validation-alert-actions">
      <button type="button" disabled={state.busy} onClick={() => void run('cancel')}><Trans>Cancel</Trans></button>
      <button type="button" disabled={state.busy}
        onClick={() => void run('continue')}><Trans>Continue</Trans></button>
    </div>
  </dialog>
}
