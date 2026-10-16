import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useEffect, useId, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom,
  pasteSpecialPanelAtom,
  runPasteSpecialPanelAtom,
} from '@einfach/spreadsheet-ui-core'
import { readBrowserClipboard } from '../../clipboard/browser-clipboard'
import './paste-special.css'

/** 模态框只处理 DOM；选项直接读取 UI Core atom，提交时才读取系统剪贴板。 */
export function PasteSpecialTools() {
  const { i18n, t } = useLingui()
  const MODES = [
    ['all', t`All contents and formatting`],
    ['values', t`Values only`],
    ['formats', t`Formatting only`],
    ['values-formats', t`Values and formatting`],
    ['formulas', t`Formulas only`],
    ['formulas-number-formats', t`Formulas and number formats`],
    ['values-number-formats', t`Values and number formats`],
    ['column-widths', t`Column widths only`],
  ] as const
  const ARITHMETIC = [
    ['none', t`None`],
    ['add', t`Add`],
    ['subtract', t`Subtract`],
    ['multiply', t`Multiply`],
    ['divide', t`Divide`],
  ] as const

  const state = useAtomValue(pasteSpecialPanelAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const run = useSetAtom(runPasteSpecialPanelAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  const target = state.target
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !target) return
    const button = buttonRef.current
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      dialog.close?.()
      button?.focus({ preventScroll: true })
    }
  }, [target])
  const widths = state.mode === 'column-widths'
  return (
    <>
      <button
        ref={buttonRef}
        className="tool-button"
        type="button"
        aria-label={t`Paste special`}
        title={t`Paste special`}
        disabled={editing || state.busy}
        onClick={() => void run('open')}
      >
        ⋯
      </button>
      {target && (
        <dialog
          ref={dialogRef}
          className="paste-special-dialog"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-hint`}
          onCancel={(event) => {
            event.preventDefault()
            void run('close')
          }}
        >
          <h2 id={`${id}-title`}><Trans>Paste special</Trans></h2>
          <p id={`${id}-hint`}><Trans>Combine options for this paste. Ordinary Paste stays unchanged.</Trans></p>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void run({ action: 'apply', read: readBrowserClipboard })
            }}
          >
            <label htmlFor={`${id}-mode`}><Trans>Paste content</Trans></label>
            <select
              id={`${id}-mode`}
              value={state.mode}
              disabled={state.busy}
              onChange={(event) => {
                const option = MODES.find(([value]) => value === event.currentTarget.value)
                if (option) void run({ field: 'mode', value: option[0] })
              }}
            >
              {MODES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label htmlFor={`${id}-arithmetic`}><Trans>Operation</Trans></label>
            <select
              id={`${id}-arithmetic`}
              value={state.arithmetic}
              disabled={state.busy || widths || state.mode === 'formats'}
              onChange={(event) => {
                const option = ARITHMETIC.find(([value]) => value === event.currentTarget.value)
                if (option) void run({ field: 'arithmetic', value: option[0] })
              }}
            >
              {ARITHMETIC.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <div className="paste-special-checks">
              {(['transpose', 'skipBlanks'] as const).map((field) => (
                <label key={field}>
                  <input
                    type="checkbox"
                    checked={state[field]}
                    disabled={state.busy || widths}
                    onChange={(event) => void run({ field, value: event.currentTarget.checked })}
                  />
                  {field === 'transpose' ? t`Transpose` : t`Skip blanks`}
                </label>
              ))}
            </div>
            {widths && (
              <p><Trans>
                Changes whole columns only. Cell contents, styles and row heights stay unchanged.
              </Trans></p>
            )}
            {state.error && (
              <p role="alert" className="paste-special-error">
                {translateFeedback(i18n, state.error)}
              </p>
            )}
            {state.busy && <p role="status"><Trans>Pasting…</Trans></p>}
            <div className="paste-special-actions">
              <button type="button" disabled={state.busy} onClick={() => void run('close')}><Trans>
                Cancel
              </Trans></button>
              <button type="submit" disabled={state.busy}><Trans>
                Apply paste
              </Trans></button>
            </div>
          </form>
        </dialog>
      )}
    </>
  )
}
