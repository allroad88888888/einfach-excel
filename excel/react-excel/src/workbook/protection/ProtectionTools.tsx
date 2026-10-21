import { useId, useLayoutEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { Trans, useLingui } from '@lingui/react/macro'
import { nativeProtectionPanelAtom, runNativeProtectionAtom, rangeToA1 } from '@einfach/spreadsheet-ui-core'
import { cycleDialogFocus } from '../chrome/ribbon/dialog-focus'
import { translateFeedback } from '../../i18n/translate-feedback'
import './protection.css'

/** The panel reads native settings and dispatches one semantic command per action. */
export function ProtectionTools(): React.JSX.Element {
  const { t, i18n } = useLingui()
  const state = useAtomValue(nativeProtectionPanelAtom)
  const run = useSetAtom(runNativeProtectionAtom)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  const protectedSheet = state.protection?.mode === 'protected'
  useLayoutEffect(() => {
    const element = dialog.current
    const opener = trigger.current
    if (!state.open || !element) return
    if (element.showModal) element.showModal()
    else element.setAttribute('open', '')
    element.querySelector<HTMLButtonElement>('[data-protection-close]')?.focus()
    return () => { element.close?.(); opener?.focus({ preventScroll: true }) }
  }, [state.open])
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="tool-button"
        aria-label={t`Worksheet protection`}
        title={t`Worksheet protection`}
        disabled={!state.available || state.busy}
        onClick={() => void run('open')}
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        >
          <path d="M10 2 3.5 4.5v5c0 4 3 6.7 6.5 8.5 3.5-1.8 6.5-4.5 6.5-8.5v-5Z" />
          <path d="m6.5 10 2.3 2.3 4.7-4.6" />
        </svg>
      </button>
      {state.open && (
        <dialog
          ref={dialog}
          className="protection-panel"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-hint`}
          onKeyDown={cycleDialogFocus}
          onCancel={(event) => {
            event.preventDefault()
            void run('close')
          }}
        >
          <h2 id={`${id}-title`}>
            <Trans>Worksheet protection</Trans>
          </h2>
          <p className="protection-sheet">{state.sheetName}</p>
          <p id={`${id}-hint`}>
            <Trans>
              Editing protection prevents accidental changes. It does not encrypt the workbook or
              keep its contents confidential.
            </Trans>
          </p>
          {state.protection && (
            <>
              <p role="status" className="protection-status">
                {protectedSheet
                  ? t`This worksheet is protected.`
                  : t`This worksheet is open for editing.`}
              </p>
              <h3>
                <Trans>Editable ranges</Trans>
              </h3>
              <p>
                <Trans>
                  Configure editable ranges before protecting the worksheet. Cells inside those
                  ranges remain editable; worksheet settings stay locked.
                </Trans>
              </p>
              <ul className="protection-ranges" aria-label={t`Editable ranges`}>
                {state.protection.unlockedRanges.length === 0 && (
                  <li>
                    <Trans>No editable ranges.</Trans>
                  </li>
                )}
                {state.protection.unlockedRanges.map((range, index) => {
                  const address = rangeToA1(range)
                  return (
                    <li key={`${address}-${index}`}>
                      <code>{address}</code>
                      <button
                        type="button"
                        aria-label={t`Remove editable range ${address}`}
                        disabled={state.busy || protectedSheet}
                        onClick={() => void run({ remove: index })}
                      >
                        <Trans>Remove</Trans>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <button
                type="button"
                className="protection-allow"
                disabled={
                  state.busy ||
                  protectedSheet ||
                  !state.selection ||
                  state.protection.unlockedRanges.length >= 256
                }
                onClick={() => void run('allow-selection')}
              >
                <Trans>Allow editing in selection</Trans>
                {state.selectionAddress && <code>{state.selectionAddress}</code>}
              </button>
              {!state.selection && (
                <p>
                  <Trans>Select one rectangular range to allow editing.</Trans>
                </p>
              )}
            </>
          )}
          {state.busy && (
            <p role="status">
              {state.phase === 'reading'
                ? t`Reading worksheet protection…`
                : t`Saving worksheet protection…`}
            </p>
          )}
          {state.error && <p role="alert">{translateFeedback(i18n, state.error)}</p>}
          <div className="protection-actions">
            <button
              data-protection-close
              type="button"
              disabled={state.phase === 'saving'}
              onClick={() => void run('close')}
            >
              <Trans>Close</Trans>
            </button>
            <button
              type="button"
              className="protection-primary"
              disabled={state.busy || !state.protection}
              onClick={() => void run(protectedSheet ? 'unprotect' : 'protect')}
            >
              {protectedSheet ? t`Unprotect worksheet` : t`Protect worksheet`}
            </button>
          </div>
        </dialog>
      )}
    </>
  )
}
